"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";

function friendlyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Mobile-safe date filter. iOS Safari won't repaint programmatic values in
// <input type="date"> (fields look blank after navigation) and offers no clear
// button, so the value is rendered as readable text from the URL while a
// visually hidden native input provides the picker/wheel.
export function DateFilterPill({
  param,
  label,
  onApply,
}: {
  param: string;
  label: string;
  onApply: (value: string) => void;
}) {
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const value = params.get(param) ?? "";

  const open = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker();
    } catch {
      // older browsers: focus alone opens the wheel on mobile
    }
  };

  return (
    <div
      className={`flex items-center overflow-hidden rounded-full ring-1 ${
        value ? "bg-zinc-900 ring-zinc-900" : "bg-white ring-zinc-200/60"
      }`}
    >
      <button
        type="button"
        onClick={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
          value ? "text-white" : "text-zinc-600"
        }`}
        title={`${label} date`}
      >
        <span className="font-medium text-zinc-400">{label}</span>
        <span>{value ? friendlyDate(value) : "Any"}</span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onApply("")}
          aria-label={`Clear ${label.toLowerCase()} date`}
          className="px-2 py-1.5 text-xs font-bold text-zinc-300"
        >
          ✕
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onApply(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-px w-px opacity-0"
      />
    </div>
  );
}
