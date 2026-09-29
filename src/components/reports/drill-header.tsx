import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { DateRange } from "@/lib/reports";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportMenu } from "@/components/reports/export-menu";

// Shared header for report drill-downs: breadcrumb, title, the SAME global
// date range as the overview, and the single Export Report action.
export function DrillHeader({
  title,
  description,
  range,
  exportOptions,
}: {
  title: string;
  description?: string;
  range: DateRange;
  exportOptions: Array<{ label: string; href: string; primary?: boolean }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/reports" className="text-xs font-semibold text-zinc-400 hover:text-zinc-700">
            Reports
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          <p className="mt-0.5 text-sm font-medium text-zinc-700">
            {formatDate(range.from)} – {formatDate(range.to)}
          </p>
        </div>
        <ExportMenu options={exportOptions} />
      </div>
      <DateRangePicker />
    </div>
  );
}
