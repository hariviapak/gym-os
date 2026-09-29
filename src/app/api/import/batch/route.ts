import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST, dateToIST, normalizePhone } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "No gym assigned" }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;
  const gymId = userData.gym_id;

  if (action === "create") {
    const { data: batch } = await supabase
      .from("import_batches")
      .insert({
        gym_id: gymId,
        filename: body.filename,
        total_rows: body.totalRows,
        status: "running",
        column_mapping: body.columnMapping,
        created_by: userData.id,
      })
      .select()
      .single();

    return NextResponse.json({ batchId: batch.id });
  }

  // Lookup: which phones already exist? (for merge preview)
  if (action === "lookup") {
    const phones: string[] = (body.phones ?? []).map((p: string) => normalizePhone(p)).filter(Boolean);
    if (phones.length === 0) return NextResponse.json({ existing: [] });

    const { data: existing } = await supabase
      .from("members")
      .select("phone")
      .eq("gym_id", gymId)
      .in("phone", phones.slice(0, 500));

    return NextResponse.json({ existing: (existing ?? []).map((m: any) => m.phone) });
  }

  if (action === "process") {
    const { batchId, rows } = body;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Fetch gym settings for GST mode
    const { data: settings } = await supabase
      .from("gym_settings")
      .select("gst_mode")
      .eq("gym_id", gymId)
      .single();
    const gstMode = settings?.gst_mode ?? "exclusive";

    // Cache packages for this gym (name -> package data)
    const { data: gymPackages } = await supabase
      .from("packages")
      .select("id, name, amount, gst_rate, duration_days, service_type")
      .eq("gym_id", gymId)
      .eq("is_active", true);
    const packageMap: Record<string, any> = {};
    (gymPackages ?? []).forEach((p: any) => {
      packageMap[p.name.toLowerCase().trim()] = p;
    });

    // ---- Pass 1: bulk fetch existing members by phone ----
    const validRows: any[] = [];
    for (const row of rows) {
      if (!row.first_name || !row.phone) {
        skipped++;
        continue;
      }
      row._phone = normalizePhone(row.phone);
      validRows.push(row);
    }

    const phoneSet = [...new Set(validRows.map((r) => r._phone))];
    const { data: existingMembers } = phoneSet.length
      ? await supabase.from("members").select("id, phone").eq("gym_id", gymId).in("phone", phoneSet)
      : { data: [] };
    const memberByPhone: Record<string, string> = {};
    (existingMembers ?? []).forEach((m: any) => {
      memberByPhone[m.phone] = m.id;
    });
    const preExisting = new Set((existingMembers ?? []).map((m: any) => m.phone));

    // ---- Pass 2: bulk insert NEW members ----
    const newPhoneSet = new Set(phoneSet.filter((p) => !memberByPhone[p]));
    const newMemberRows = validRows
      .filter((r) => newPhoneSet.has(r._phone))
      .map((r) => ({
        gym_id: gymId,
        first_name: r.first_name,
        last_name: r.last_name || null,
        phone: r._phone,
        email: r.email || null,
        gender: r.gender || null,
        date_of_birth: r.date_of_birth || null,
        address: r.address || null,
        emergency_contact_name: r.emergency_contact_name || null,
        emergency_contact_phone: r.emergency_contact_phone || null,
        referred_by: r.referred_by || null,
        status: "active",
      }));

    if (newMemberRows.length > 0) {
      const { data: insertedMembers, error: insertError } = await supabase
        .from("members")
        .insert(newMemberRows)
        .select("id, phone");
      if (insertError) {
        errors += newMemberRows.length;
      } else {
        (insertedMembers ?? []).forEach((m: any) => {
          memberByPhone[m.phone] = m.id;
        });
        created += insertedMembers?.length ?? 0;
      }
    }

    // ---- Pass 3: bulk fetch existing memberships (for per-package dedup) ----
    const allMemberIds = [...new Set(Object.values(memberByPhone))];
    const { data: existingMemberships } = allMemberIds.length
      ? await supabase
          .from("memberships")
          .select("member_id, package_id")
          .eq("gym_id", gymId)
          .in("member_id", allMemberIds)
      : { data: [] };
    const existingMsKeys = new Set(
      (existingMemberships ?? []).map((ms: any) => `${ms.member_id}:${ms.package_id}`)
    );

    // ---- Pass 4: per-row prep (update merged members, build membership/payment arrays) ----
    const today = todayIST();
    const membershipRows: any[] = [];
    const updatePromises: Promise<void>[] = [];

    for (const row of validRows) {
      const memberId = memberByPhone[row._phone];
      if (!memberId) {
        errors++;
        continue;
      }

      // Merge: update fields on members that existed BEFORE this import
      if (preExisting.has(row._phone)) {
        updated++;
        updatePromises.push(
          (async () => {
            await supabase
              .from("members")
              .update({
                first_name: row.first_name,
                last_name: row.last_name || null,
                email: row.email || null,
                gender: row.gender || null,
                date_of_birth: row.date_of_birth || null,
                address: row.address || null,
                emergency_contact_name: row.emergency_contact_name || null,
                emergency_contact_phone: row.emergency_contact_phone || null,
                referred_by: row.referred_by || null,
              })
              .eq("id", memberId);
          })()
        );
      }

      // Membership: package_name + (start_date OR end_date)
      if (row.package_name && (row.start_date || row.end_date)) {
        const pkg = packageMap[(row.package_name as string).toLowerCase().trim()];
        if (pkg && !existingMsKeys.has(`${memberId}:${pkg.id}`)) {
          let startDateStr: string;
          let endDateStr: string;
          if (row.start_date) {
            startDateStr = row.start_date;
            const endDate = new Date(startDateStr);
            endDate.setDate(endDate.getDate() + pkg.duration_days);
            endDateStr = dateToIST(endDate);
          } else {
            endDateStr = row.end_date;
            const startDate = new Date(endDateStr);
            startDate.setDate(startDate.getDate() - (pkg.duration_days - 1));
            startDateStr = dateToIST(startDate);
          }

          const msStatus = endDateStr < today ? "expired" : "active";
          const pkgAmount = Number(pkg.amount);
          let amount: number;
          let gstAmount: number;
          let totalAmount: number;

          if (gstMode === "inclusive") {
            totalAmount = pkgAmount;
            amount = Number((pkgAmount / (1 + pkg.gst_rate / 100)).toFixed(2));
            gstAmount = Number((totalAmount - amount).toFixed(2));
          } else {
            amount = pkgAmount;
            gstAmount = Number((amount * (pkg.gst_rate / 100)).toFixed(2));
            totalAmount = amount + gstAmount;
          }

          const paymentAmount = row.payment_amount ? parseFloat(row.payment_amount) : 0;
          const paymentStatus = totalAmount === 0 ? "paid" : paymentAmount >= totalAmount ? "paid" : paymentAmount > 0 ? "partial" : "pending";

          membershipRows.push({
            row,
            memberId,
            pkg,
            startDateStr,
            endDateStr,
            msStatus,
            amount,
            gstAmount,
            totalAmount,
            paymentAmount,
            paymentStatus,
          });
          existingMsKeys.add(`${memberId}:${pkg.id}`);
        }
      }
    }

    // ---- Pass 5: bulk insert memberships ----
    const msInsertPayload = membershipRows.map((m) => ({
      gym_id: gymId,
      member_id: m.memberId,
      package_id: m.pkg.id,
      package_name: m.pkg.name,
      status: m.msStatus,
      payment_status: m.paymentStatus,
      start_date: m.startDateStr,
      end_date: m.endDateStr,
      amount: m.amount,
      gst_amount: m.gstAmount,
      total_amount: m.totalAmount,
      amount_paid: m.paymentAmount,
      created_by: userData.id,
    }));

    const insertedMsList: any[] = [];
    if (msInsertPayload.length > 0) {
      const { data: insertedMs } = await supabase
        .from("memberships")
        .insert(msInsertPayload)
        .select("id, member_id, package_id");
      (insertedMs ?? []).forEach((ms: any, i: number) => {
        insertedMsList.push({ ...membershipRows[i], id: ms.id });
      });
    }

    // ---- Pass 6: bulk insert payments (amount > 0) ----
    const paidRows = insertedMsList.filter((m) => m.paymentAmount > 0);
    let insertedPayments: any[] = [];
    if (paidRows.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .insert(
          paidRows.map((m) => ({
            gym_id: gymId,
            member_id: m.memberId,
            membership_id: m.id,
            amount: m.paymentAmount,
            mode: (m.row.payment_mode as string) || "cash",
            payment_date: m.startDateStr,
            created_by: userData.id,
          }))
        )
        .select("id, membership_id");
      insertedPayments = payments ?? [];
    }

    // ---- Pass 7: bulk receipts (single rpc call for N numbers) ----
    if (insertedPayments.length > 0) {
      const { data: receiptNos } = await supabase
        .rpc("get_next_receipt_nos", { p_gym_id: gymId, p_count: insertedPayments.length });
      const nos = (receiptNos ?? []) as number[];

      const receiptPayload = insertedPayments.map((p: any, i: number) => {
        const ms = paidRows.find((m: any) => m.id === p.membership_id);
        return {
          gym_id: gymId,
          receipt_no: nos[i],
          member_id: ms.memberId,
          membership_id: ms.id,
          payment_id: p.id,
          amount: ms.amount,
          gst_amount: ms.gstAmount,
          total_amount: ms.totalAmount,
          created_by: userData.id,
        };
      });

      const { data: insertedReceipts } = await supabase
        .from("receipts")
        .insert(receiptPayload)
        .select("id, payment_id");

      // Link receipts back to payments (single bulk update per receipt is avoided via mapping)
      if (insertedReceipts && insertedReceipts.length > 0) {
        await Promise.all(
          insertedReceipts.map((r: any) =>
            supabase.from("payments").update({ receipt_id: r.id }).eq("id", r.payment_id)
          )
        );
      }
    }

    // ---- Pass 8: bulk insert timeline events ----
    const eventPayload = insertedMsList.map((m) => ({
      gym_id: gymId,
      member_id: m.memberId,
      event_type: "import_enrollment",
      title: `Imported: ${m.pkg.name}${m.msStatus === "expired" ? " (expired)" : ""}`,
      description: `${m.startDateStr} → ${m.endDateStr} · ${m.paymentStatus}`,
      metadata: { membership_id: m.id, package_id: m.pkg.id },
      created_by: userData.id,
    }));

    if (eventPayload.length > 0) {
      await supabase.from("member_events").insert(eventPayload);
    }

    // Await member merges
    await Promise.all(updatePromises);

    return NextResponse.json({ created, updated, skipped, errors });
  }

  if (action === "complete") {
    const { batchId, stats } = body;
    const status = stats.errors > 0 ? (stats.created > 0 ? "partial" : "failed") : "completed";

    await supabase
      .from("import_batches")
      .update({
        status,
        processed_rows: stats.created + stats.updated + stats.skipped + stats.errors,
        created_rows: stats.created,
        updated_rows: stats.updated,
        skipped_rows: stats.skipped,
        error_rows: stats.errors,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId)
      .eq("gym_id", gymId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
