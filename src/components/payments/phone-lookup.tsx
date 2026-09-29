"use client";

import { useState, useCallback } from "react";

export interface QuickMember {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

export function PhoneLookup({
  members,
  onSelect,
}: {
  members: QuickMember[];
  onSelect: (member: QuickMember | null, phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [matched, setMatched] = useState<QuickMember | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleInput = useCallback((value: string) => {
    setPhone(value);
    if (value.length >= 3) {
      const found = members.filter((m) => m.phone.includes(value));
      if (found.length === 1 && found[0].phone === value) {
        setMatched(found[0]);
        onSelect(found[0], value);
        setShowResults(false);
      } else if (found.length > 0) {
        setMatched(null);
        setShowResults(true);
      } else {
        setMatched(null);
        onSelect(null, value);
        setShowResults(false);
      }
    } else {
      setMatched(null);
      onSelect(null, value);
      setShowResults(false);
    }
  }, [members, onSelect]);

  return (
    <div>
      <input
        type="tel"
        value={phone}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Enter phone number..."
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
      {showResults && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200">
          {members
            .filter((m) => m.phone.includes(phone))
            .slice(0, 5)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setPhone(m.phone);
                  setMatched(m);
                  onSelect(m, m.phone);
                  setShowResults(false);
                }}
                className="flex w-full items-center justify-between border-b border-zinc-100 px-4 py-2 text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">
                  {m.first_name} {m.last_name}
                </span>
                <span className="text-zinc-500">{m.phone}</span>
              </button>
            ))}
        </div>
      )}
      {matched && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
          <span className="text-sm font-medium text-green-900">
            ✓ {matched.first_name} {matched.last_name}
          </span>
          <button
            type="button"
            onClick={() => {
              setMatched(null);
              onSelect(null, phone);
            }}
            className="text-xs text-green-600 hover:underline"
          >
            Use as new member
          </button>
        </div>
      )}
    </div>
  );
}

export function PackageAmountSync({
  packages,
}: {
  packages: { id: string; name: string; amount: number; type: string; duration_days: number }[];
}) {
  return null;
}
