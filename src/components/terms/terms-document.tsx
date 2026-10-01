// Shared terms-document rendering: the exact same formatted document body
// used by BOTH the staff signed-documents page and the member's public
// signed-copy route — one layout, two audiences.

export function TermsBody({ body }: { body: string }) {
  const lines = (body ?? "").split("\n");
  return (
    <div className="text-[11px] leading-[1.7] text-zinc-700">
      {lines.map((line: string, i: number) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={i} className="h-3" />;
        }
        const isSectionHeader = /^\d+\.\s+[A-Z]/.test(trimmed);
        const isSubHeader = /^[A-Z][A-Z\s,&]+$/.test(trimmed) && trimmed.length < 50;
        const isBullet = trimmed.startsWith("•");

        if (isSectionHeader) {
          return (
            <p key={i} className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-zinc-900">
              {trimmed}
            </p>
          );
        }
        if (isSubHeader) {
          return (
            <p key={i} className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-zinc-800">
              {trimmed}
            </p>
          );
        }
        if (isBullet) {
          return (
            <p key={i} className="pl-4 text-[11px] leading-[1.6] text-zinc-600">
              <span className="mr-1.5">•</span>
              {trimmed.slice(1).trim()}
            </p>
          );
        }
        return (
          <p key={i} className="text-[11px] leading-[1.6] text-zinc-600">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export function SignedDoc({
  gymName,
  gymAddress,
  gymPhone,
  title,
  version,
  category,
  memberName,
  memberPhone,
  memberEmail,
  body,
  signatureImage,
  signedName,
  signedAt,
  method,
  signedIp,
}: {
  gymName: string;
  gymAddress?: string;
  gymPhone?: string;
  title: string;
  version: string;
  category?: string;
  memberName: string;
  memberPhone?: string;
  memberEmail?: string;
  body: string;
  signatureImage?: string | null;
  signedName: string;
  signedAt: string | Date;
  method: string;
  signedIp?: string | null;
}) {
  const fmt = (d: string | Date) =>
    new Date(typeof d === "string" ? d : d.toISOString()).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6 bg-white p-10 print:break-before-page print:border-0 print:p-0 print:shadow-none">
      {/* Document header */}
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">{gymName}</h1>
        {gymAddress && <p className="mt-0.5 text-xs text-zinc-500">{gymAddress}</p>}
        {gymPhone && <p className="text-xs text-zinc-500">Phone: {gymPhone}</p>}
        <div className="mx-auto mt-3 w-16 border-t-2 border-zinc-900" />
        <h2 className="mt-3 text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-xs text-zinc-400">
          Version {version} · {category === "swimming" ? "Swimming Pool Rules" : "Gym Terms & Conditions"}
        </p>
      </div>

      {/* Member info box */}
      <div className="mt-6 rounded border border-zinc-200 px-4 py-3 print:border-zinc-300">
        <div className="grid grid-cols-2 gap-1 text-xs">
          <div>
            <span className="text-zinc-400">Member Name: </span>
            <span className="font-semibold text-zinc-700">{memberName}</span>
          </div>
          {memberPhone && (
            <div>
              <span className="text-zinc-400">Phone: </span>
              <span className="font-semibold text-zinc-700">{memberPhone}</span>
            </div>
          )}
          {memberEmail && (
            <div>
              <span className="text-zinc-400">Email: </span>
              <span className="font-semibold text-zinc-700">{memberEmail}</span>
            </div>
          )}
        </div>
      </div>

      {/* Terms body */}
      <div className="mt-6">
        <TermsBody body={body} />
      </div>

      {/* Signature section */}
      <div className="mt-10 print:break-inside-avoid">
        <div className="border-t border-zinc-300 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Member Signature</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              {signatureImage && <img src={signatureImage} alt="Signature" className="h-20" />}
              <div className="mt-1 w-48 border-t border-zinc-400" />
              <p className="mt-1 text-xs font-semibold text-zinc-700">{signedName}</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <p>
                <span className="text-zinc-400">Date: </span>
                {fmt(signedAt)}
              </p>
              <p>
                <span className="text-zinc-400">Method: </span>
                {method === "magic_link" ? "WhatsApp Link" : "Tablet Signature"}
              </p>
              {signedIp && (
                <p>
                  <span className="text-zinc-400">IP: </span>
                  {signedIp}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
