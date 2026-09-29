"use client";

import { todayIST } from "@/lib/utils";

export default function ExportButton({
  href = "/api/export/members",
  label = "Export CSV",
  filename = "members",
}: {
  href?: string;
  label?: string;
  filename?: string;
}) {
  const handleExport = async () => {
    const res = await fetch(href);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="whitespace-nowrap rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
    >
      {label}
    </button>
  );
}
