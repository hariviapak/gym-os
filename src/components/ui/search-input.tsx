"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Instant-feeling search for server-rendered lists: the input updates the URL
// after a short debounce inside a transition, so typing never blocks and the
// server refresh happens once you stop — not on every keystroke.
export function SearchInput({
  defaultValue = "",
  placeholder,
  className = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900",
  param = "q",
}: {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  param?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef(defaultValue);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(Array.from(searchParams.entries()));
      if (v.trim()) p.set(param, v.trim());
      else p.delete(param);
      p.delete("page");
      lastPushed.current = v.trim();
      startTransition(() => {
        router.replace(p.size ? `?${p.toString()}` : "?", { scroll: false });
      });
    }, 400);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className={`${className} ${pending ? "opacity-70" : ""}`}
      />
      {pending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">…</span>
      )}
    </div>
  );
}
