// Verifies the payments search query shape with a real authenticated session.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: "admin@792fitness.com",
  password: "Admin@792Fit",
});
if (authErr) { console.error("login failed:", authErr.message); process.exit(1); }
const client = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
});
const gymId = "00000000-0000-0000-0000-000000000001";

async function searchPayments(q) {
  const { data: matched } = await client
    .from("members")
    .select("id")
    .eq("gym_id", gymId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(50);
  const ids = (matched ?? []).map((m) => m.id);
  const { data, count, error } = await client
    .from("payments")
    .select("id, reference_note, amount, members(first_name, last_name)", { count: "exact" })
    .eq("gym_id", gymId)
    .or(
      ids.length
        ? `reference_note.ilike.%${q}%,member_id.in.(${ids.join(",")})`
        : `reference_note.ilike.%${q}%`
    )
    .limit(5);
  if (error) return `ERROR: ${error.message}`;
  return `${count} payments -> ${data.map((x) => `${x.members?.first_name} ₹${x.amount}`).join(", ")}`;
}

console.log("search 'hari':", await searchPayments("hari"));
console.log("search 'yashoda':", await searchPayments("yashoda"));
console.log("search '14168973725':", await searchPayments("14168973725"));
