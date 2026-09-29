"use client";

import { useEffect, useRef, useState } from "react";
import { enrollMember } from "@/lib/actions/enrollment";
import { SubmitButton } from "@/components/ui/submit-button";
import { PackagePaymentSection, GroupState } from "@/components/members/package-payment-section";
import Link from "next/link";

interface PackageInfo {
  id: string;
  name: string;
  amount: number;
  duration_days: number;
  gst_rate: number;
  type: string;
  service_type: string;
  is_group_package: boolean;
}

interface MemberOption {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

interface TermsInfo {
  id: string;
  title: string;
  category: string;
}

const STEPS = ["Member Details", "Package & Payment", "Terms & Finish"];

export function EnrollmentWizard({
  packages,
  members,
  terms,
  gstMode,
}: {
  packages: PackageInfo[];
  members: MemberOption[];
  terms: TermsInfo[];
  gstMode: string;
}) {
  const groupState = useRef<GroupState>({ isGroup: false, hasPackage: false, participantCount: 0, splitValid: true, collectedValid: true });
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupResult, setLookupResult] = useState<{
    forDigits: string;
    member: { id: string; name: string } | null;
  } | null>(null);

  const digits = phone.replace(/\D/g, "");
  const checking = digits.length >= 10 && lookupResult?.forDigits !== digits;
  const foundMember = !checking && lookupResult?.member ? lookupResult.member : null;

  // Debounced duplicate-phone lookup while typing
  useEffect(() => {
    if (digits.length < 10) return;
    const currentDigits = digits;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members/lookup?phone=${encodeURIComponent(currentDigits)}`);
        const data = await res.json();
        setLookupResult({ forDigits: currentDigits, member: data.found ? data.member : null });
      } catch {
        setLookupResult({ forDigits: currentDigits, member: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [digits]);

  const inputCls =
    "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
  const labelCls = "block text-xs font-medium text-zinc-600";

  const validateStep = (e: React.MouseEvent, target: number) => {
    e.preventDefault();
    const section = document.getElementById(`wizard-step-${step}`);
    if (section) {
      const invalid = Array.from(section.querySelectorAll("input, select")).find(
        (el) => !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).checkValidity()
      );
      if (invalid) {
        (invalid as HTMLInputElement).reportValidity();
        return;
      }
    }
    if (step === 2) {
      const gs = groupState.current;
      if (gs.isGroup && gs.participantCount < 2) {
        alert(
          "This is a Family/Group package — add at least 1 more group member in the \u201CGroup members\u201D panel (Existing member or + New member) before continuing."
        );
        return;
      }
      if (gs.isGroup && !gs.splitValid) {
        alert("The payment split must add up to the package total before continuing.");
        return;
      }
      if (gs.isGroup && !gs.collectedValid) {
        alert("\u201CAmount collected now\u201D cannot be more than the package total.");
        return;
      }
    }
    setStep(target);
  };

  return (
    <form action={enrollMember} className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const isDone = step > n;
          const isCurrent = step === n;
          return (
            <div key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => (step > n ? validateStep(e, n) : undefined)}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                  isCurrent
                    ? "bg-zinc-900 text-white"
                    : isDone
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {isDone ? "✓" : n}
              </button>
              <span className={`hidden text-xs font-medium sm:block ${isCurrent ? "text-zinc-900" : "text-zinc-400"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-zinc-200 sm:w-8" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Member Details */}
      <section
        id="wizard-step-1"
        className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 ${step === 1 ? "" : "hidden"}`}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Member Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>First Name *</label>
            <input
              name="first_name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input name="last_name" className={inputCls} />
          </div>
          <div className="relative">
            <label className={labelCls}>Phone *</label>
            <input
              name="phone"
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              placeholder="9876543210"
            />
            {checking && <p className="mt-1 text-xs text-zinc-400">Checking…</p>}
            {foundMember && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                <p className="text-xs font-medium text-amber-900">
                  This phone is already used by <strong>{foundMember.name}</strong>.
                </p>
                <Link
                  href={`/dashboard/members/${foundMember.id}`}
                  className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-700"
                >
                  Open profile
                </Link>
                <span className="text-[11px] text-amber-700">
                  Only continue if this is a different person (e.g. a child sharing the parent&apos;s number).
                </span>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input name="email" type="email" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Gender</label>
            <select name="gender" className={inputCls}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input name="date_of_birth" type="date" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Address</label>
            <input name="address" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Emergency Contact</label>
            <input name="emergency_contact_name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Emergency Phone</label>
            <input name="emergency_contact_phone" type="tel" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Medical Notes</label>
            <input name="medical_notes" className={inputCls} placeholder="Allergies, conditions..." />
          </div>
          <div>
            <label className={labelCls}>Injury Notes</label>
            <input name="injury_notes" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Referred By</label>
            <input name="referred_by" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Step 2: Package & Payment */}
      <section
        id="wizard-step-2"
        className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 ${step === 2 ? "" : "hidden"}`}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Package & Payment</h2>
        <PackagePaymentSection
          packages={packages}
          gstMode={gstMode}
          members={members}
          terms={terms}
          primaryMemberName={firstName}
          groupStateRef={groupState}
        />
      </section>

      {/* Step 3: Terms & Finish */}
      <section
        id="wizard-step-3"
        className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 ${step === 3 ? "" : "hidden"}`}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Terms & Gift Kit</h2>
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">
              Terms attach automatically based on the package&apos;s service (Gym → Gym T&amp;C, Swimming → Pool
              Rules). The exact documents for the selected package are shown in the Package step — sign them after
              enrollment on the member profile.
            </p>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="gift_kit"
                value="yes"
                className="mt-1 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-sm text-zinc-600">Assign gift kit (welcome kit)</span>
            </label>
            <label className="flex items-start gap-2 pl-6">
              <input
                type="checkbox"
                name="gift_kit_delivered"
                value="yes"
                className="mt-1 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="text-xs text-zinc-500">Physical kit handed over now</span>
            </label>
          </div>
        </div>
      </section>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => validateStep(e, step - 1)}
          disabled={step === 1}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:invisible"
        >
          ← Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={(e) => validateStep(e, step + 1)}
            className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Next →
          </button>
        ) : (
          <SubmitButton
            className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            label="Enrolling..."
          >
            Complete Enrollment
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
