"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { normalizePhone } from "@/lib/utils";

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  [csvColumn: string]: string;
}

const MEMBER_FIELDS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: false },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "date_of_birth", label: "Date of Birth", required: false },
  { key: "address", label: "Address", required: false },
  { key: "emergency_contact_name", label: "Emergency Contact", required: false },
  { key: "emergency_contact_phone", label: "Emergency Phone", required: false },
  { key: "referred_by", label: "Referred By", required: false },
  { key: "package_name", label: "Package Name", required: false },
  { key: "start_date", label: "Start Date", required: false },
  { key: "end_date", label: "End Date", required: false },
  { key: "payment_amount", label: "Payment Amount", required: false },
  { key: "payment_mode", label: "Payment Mode", required: false },
];

const BATCH_SIZE = 50;

// Normalize date strings: DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD (ISO)
function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

export default function ImportWizard() {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [progress, setProgress] = useState({ processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
  const [batchId, setBatchId] = useState<string | null>(null);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());

  const autoMap = (cols: string[]) => {
    const auto: ColumnMapping = {};
    cols.forEach((col) => {
      const lower = col.toLowerCase().trim();
      const match = MEMBER_FIELDS.find(
        (f) =>
          lower.includes(f.key) ||
          lower.includes(f.label.toLowerCase()) ||
          lower === f.key
      );
      if (match) auto[col] = match.key;
    });
    setMapping(auto);
  };

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as ParsedRow[];
          const cols = results.meta.fields ?? [];
          setHeaders(cols);
          setRows(data);
          autoMap(cols);
          setStep("map");
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });
        const cols = Object.keys(json[0] ?? {});
        setHeaders(cols);
        setRows(json);
        autoMap(cols);
        setStep("map");
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const mappedRows = rows
    .map((row) => {
      const mapped: ParsedRow = {};
      Object.entries(mapping).forEach(([csvCol, dbField]) => {
        if (dbField && row[csvCol] !== undefined) {
          let value = row[csvCol];
          if (dbField === "start_date" || dbField === "end_date" || dbField === "date_of_birth") {
            value = normalizeDate(value) ?? value;
          }
          mapped[dbField] = value;
        }
      });
      return mapped;
    })
    .filter((r) => r.first_name || r.phone);

  const loadMergeInfo = async () => {
    const phones = [...new Set(mappedRows.map((r) => r.phone).filter(Boolean))];
    if (phones.length === 0) {
      setExistingPhones(new Set());
      setStep("preview");
      return;
    }
    try {
      const res = await fetch("/api/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", phones }),
      });
      const { existing } = await res.json();
      setExistingPhones(new Set((existing ?? []).map((p: string) => p)));
    } catch {
      setExistingPhones(new Set());
    }
    setStep("preview");
  };

  const handleImport = async () => {
    setStep("importing");
    setProgress({ processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

    // Create import batch
    const batchRes = await fetch("/api/import/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        filename: fileName,
        totalRows: mappedRows.length,
        columnMapping: mapping,
      }),
    });
    const { batchId: bId } = await batchRes.json();
    setBatchId(bId);

    // Process in batches
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalProcessed = 0;

    for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
      const batch = mappedRows.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "process",
            batchId: bId,
            rows: batch,
          }),
        });
        const result = await res.json();
        totalCreated += result.created ?? 0;
        totalUpdated += result.updated ?? 0;
        totalSkipped += result.skipped ?? 0;
        totalErrors += result.errors ?? 0;
        totalProcessed += batch.length;
        setProgress({
          processed: totalProcessed,
          created: totalCreated,
          updated: totalUpdated,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      } catch {
        totalErrors += batch.length;
        totalProcessed += batch.length;
        setProgress({
          processed: totalProcessed,
          created: totalCreated,
          updated: totalUpdated,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }
    }

    // Complete batch
    await fetch("/api/import/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        batchId: bId,
        stats: { created: totalCreated, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors },
      }),
    });

    setStep("done");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Import Members</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a CSV or Excel file to bulk import members
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {["Upload", "Map Columns", "Preview", "Import", "Done"].map((label, i) => {
          const stepOrder = ["upload", "map", "preview", "importing", "done"];
          const isActive = stepOrder.indexOf(step) >= i;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isActive ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {i + 1}
              </div>
              <span className={isActive ? "text-zinc-900" : "text-zinc-400"}>{label}</span>
              {i < 4 && <span className="text-zinc-300">→</span>}
            </div>
          );
        })}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          {/* Template download */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">Need a template?</p>
              <p className="text-xs text-zinc-500">Download a template with correct headers and a sample row.</p>
              <p className="mt-1 text-xs text-zinc-400">
                Columns: First Name*, Last Name, Phone*, Email, Gender, Date of Birth, Address,
                Emergency Contact, Emergency Phone, Referred By, Package Name, Start Date, End Date, Payment Amount, Payment Mode
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Package Name must match an existing package. Dates: YYYY-MM-DD or DD-MM-YYYY (auto-converted).
                If only End Date is provided, Start Date is back-calculated from the package duration.
                Memberships with past end dates are imported as expired.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const headers = MEMBER_FIELDS.map((f) => f.label);
                  const sample = ["Rahul", "Sharma", "9876543210", "rahul@example.com", "male", "1995-06-15", "MG Road, Bangalore", "Suresh Sharma", "9123456780", "Friend", "Monthly Membership", "2026-09-23", "1500", "cash"];
                  const csv = [headers.join(","), sample.map((v) => `"${v}"`).join(",")].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "members-template.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-white"
              >
                CSV Template
              </button>
              <button
                onClick={() => {
                  const headers = MEMBER_FIELDS.map((f) => f.label);
                  const sample = ["Rahul", "Sharma", "9876543210", "rahul@example.com", "male", "1995-06-15", "MG Road, Bangalore", "Suresh Sharma", "9123456780", "Friend", "Monthly Membership", "2026-09-23", "1500", "cash"];
                  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
                  ws["!cols"] = headers.map(() => ({ wch: 18 }));
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Members");
                  XLSX.writeFile(wb, "members-template.xlsx");
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-white"
              >
                Excel Template
              </button>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-zinc-300 p-12 cursor-pointer transition hover:border-zinc-400 hover:bg-zinc-50">
            <svg className="h-12 w-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900">Click to upload or drag & drop</p>
              <p className="text-xs text-zinc-500">CSV, XLSX, or XLS files</p>
            </div>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        </div>
      )}

      {/* Map Columns Step */}
      {step === "map" && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Map Columns</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Match your file columns to the database fields. Required fields are marked with *.
          </p>
          <div className="space-y-3">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-4">
                <span className="w-1/3 truncate text-sm text-zinc-600">{header}</span>
                <span className="text-zinc-300">→</span>
                <select
                  value={mapping[header] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [header]: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">— Skip —</option>
                  {MEMBER_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}{f.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setStep("upload")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              onClick={loadMergeInfo}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Preview Data
            </button>
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            Preview ({mappedRows.length} rows)
          </h2>
          <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              {mappedRows.filter((r) => !r.phone || !existingPhones.has(normalizePhone(r.phone))).length} new
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
              {mappedRows.filter((r) => r.phone && existingPhones.has(normalizePhone(r.phone))).length} merge (existing member)
            </span>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">First Name</th>
                  <th className="px-3 py-2">Last Name</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2">Start Date</th>
                  <th className="px-3 py-2">End Date</th>
                  <th className="px-3 py-2">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {mappedRows.slice(0, 100).map((row, i) => {
                  const isMerge = row.phone && existingPhones.has(normalizePhone(row.phone));
                  return (
                    <tr key={i} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        {isMerge ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Merge
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            New
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.first_name}</td>
                      <td className="px-3 py-2">{row.last_name}</td>
                      <td className="px-3 py-2">{row.phone}</td>
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{row.package_name ?? "—"}</td>
                      <td className="px-3 py-2">{row.start_date ?? "—"}</td>
                      <td className="px-3 py-2">{row.end_date ?? "—"}</td>
                      <td className="px-3 py-2">{row.payment_amount ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {mappedRows.length > 100 && (
            <p className="mt-2 text-xs text-zinc-400">
              Showing first 100 rows. All {mappedRows.length} rows will be imported.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setStep("map")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Import {mappedRows.length} Members
            </button>
          </div>
        </div>
      )}

      {/* Importing Step */}
      {step === "importing" && (
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
            <h2 className="mt-4 text-lg font-semibold text-zinc-900">Importing...</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {progress.processed} / {rows.length} rows processed
            </p>
            <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full bg-zinc-900 transition-all"
                style={{ width: `${rows.length > 0 ? (progress.processed / rows.length) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <span className="text-green-600">Created: {progress.created}</span>
              <span className="text-blue-600">Updated: {progress.updated}</span>
              <span className="text-yellow-600">Skipped: {progress.skipped}</span>
              <span className="text-red-600">Errors: {progress.errors}</span>
            </div>
          </div>
        </div>
      )}

      {/* Done Step */}
      {step === "done" && (
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-900">Import Complete</h2>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <span className="text-green-600">Created: {progress.created}</span>
              <span className="text-blue-600">Updated: {progress.updated}</span>
              <span className="text-yellow-600">Skipped: {progress.skipped}</span>
              <span className="text-red-600">Errors: {progress.errors}</span>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/dashboard/members"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                View Members
              </Link>
              <button
                onClick={() => {
                  setStep("upload");
                  setFileName("");
                  setHeaders([]);
                  setRows([]);
                  setMapping({});
                  setProgress({ processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
                  setBatchId(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Import Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
