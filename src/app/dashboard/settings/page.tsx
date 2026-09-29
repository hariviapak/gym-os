import { createClient } from "@/lib/supabase/server";
import { updateGymSettings, updateGym } from "@/lib/actions/settings";
import { createTemplate, updateTemplate, deleteTemplate } from "@/lib/actions/templates";
import { LogoUpload } from "@/components/settings/logo-upload";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-400">You don&apos;t have access to settings.</p>
      </div>
    );
  }

  const gymId = userData!.gym_id;
  const params = await searchParams;

  const [{ data: gym }, { data: settings }, { data: templates }] = await Promise.all([
    supabase.from("gyms").select("*").eq("id", gymId).single(),
    supabase.from("gym_settings").select("*").eq("gym_id", gymId).single(),
    supabase.from("message_templates").select("*").eq("gym_id", gymId).order("type", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Gym configuration and integrations</p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* Gym Logo */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <LogoUpload gymId={gymId} currentLogoUrl={gym?.logo_url ?? null} gymName={gym?.name ?? "Gym"} />
      </div>

      {/* Gym Details (editable) */}
      <form action={updateGym} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Gym Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Name *</label>
            <input
              name="name"
              required
              defaultValue={gym?.name ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Code</label>
            <input
              name="code"
              disabled
              defaultValue={gym?.code ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">GSTIN</label>
            <input
              name="gstin"
              defaultValue={gym?.gstin ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="29ABCDE1234F1Z5"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Phone</label>
            <input
              name="phone"
              defaultValue={gym?.phone ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="08012345678"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={gym?.email ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="contact@792fitness.com"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Address</label>
            <input
              name="address"
              defaultValue={gym?.address ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="123 MG Road, Bangalore"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Digital Kit URL (gym-level default)</label>
            <input
              name="digital_kit_url"
              type="url"
              defaultValue={gym?.digital_kit_url ?? ""}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="https://drive.google.com/..."
            />
            <p className="mt-1 text-xs text-zinc-400">
              Default digital content link sent with welcome kit. Can be overridden per package.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <SubmitButton
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            label="Saving..."
          >
            Save Gym Details
          </SubmitButton>
        </div>
      </form>

      {/* Configuration */}
      <form action={updateGymSettings} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Configuration</h2>
        <input type="hidden" name="gym_id" value={gymId} />
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Grace Period (days after expiry)</label>
            <input
              name="grace_period_days"
              type="number"
              min={0}
              max={3}
              defaultValue={settings?.grace_period_days ?? 0}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-400">0–3 days. Member access stays active during this period.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Default GST Rate (%)</label>
            <input
              name="gst_rate"
              type="number"
              step="0.01"
              defaultValue={settings?.gst_rate ?? 18}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">GST Mode</label>
            <select
              name="gst_mode"
              defaultValue={settings?.gst_mode ?? "inclusive"}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="inclusive">Inclusive (price includes GST)</option>
              <option value="exclusive">Exclusive (GST added on top)</option>
            </select>
            <p className="mt-1 text-xs text-zinc-400">
              Inclusive: ₹1500 is the total price, GST is extracted from it. Exclusive: ₹1500 + 18% = ₹1770.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Receipt Prefix</label>
            <input
              name="receipt_prefix"
              defaultValue={settings?.receipt_prefix ?? "RCT"}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <SubmitButton
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            label="Saving..."
          >
            Save Settings
          </SubmitButton>
        </div>
      </form>

      {/* Message Templates */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">Message Templates</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Variables: {"{name}"}, {"{full_name}"}, {"{end_date}"}, {"{amount}"}, {"{gym_name}"}, {"{package_name}"}, {"{digital_kit_url}"}
        </p>

        {/* Existing templates */}
        <div className="mb-4 space-y-2">
          {templates?.map((t: any) => (
            <form
              key={t.id}
              action={updateTemplate.bind(null, t.id)}
              className="rounded-lg border border-zinc-200 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{t.type}</span>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <input type="checkbox" name="is_active" defaultChecked={t.is_active} className="h-3.5 w-3.5" />
                  Active
                </label>
              </div>
              <input
                name="name"
                defaultValue={t.name}
                className="mt-2 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm font-medium focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <textarea
                name="content"
                rows={3}
                defaultValue={t.content}
                className="mt-2 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <div className="mt-2 flex gap-2">
                <SubmitButton
                  className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-zinc-800"
                  label="..."
                >
                  Update
                </SubmitButton>
                <button
                  type="submit"
                  formAction={deleteTemplate.bind(null, t.id)}
                  className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </form>
          ))}
        </div>

        {/* New template form */}
        <details className="rounded-lg border border-zinc-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">+ New Template</summary>
          <form action={createTemplate} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                name="name"
                type="text"
                required
                placeholder="Template name"
                className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <select
                name="type"
                className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                defaultValue="custom"
              >
                <option value="welcome_kit">Welcome Kit</option>
                <option value="renewal">Renewal</option>
                <option value="dues">Dues</option>
                <option value="birthday">Birthday</option>
                <option value="gift_kit">Gift Kit Ready</option>
                <option value="freeze">Freeze</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <textarea
              name="content"
              rows={3}
              required
              placeholder="Message content with {variables}..."
              className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            <SubmitButton
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
              label="..."
            >
              Add Template
            </SubmitButton>
          </form>
        </details>
      </div>

      {/* WhatsApp Config (Phase 3 shell) */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          WhatsApp Integration
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
            Phase 3
          </span>
        </h2>
        <p className="text-sm text-zinc-500">
          Bring your own WhatsApp Cloud API credentials. Outbound-only (reminders, confirmations, alerts).
        </p>
        <div className="mt-4 space-y-3 opacity-60">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Phone Number ID</label>
            <input
              disabled
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-zinc-50"
              placeholder="Coming in Phase 3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Access Token</label>
            <input
              disabled
              type="password"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-zinc-50"
              placeholder="Coming in Phase 3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
