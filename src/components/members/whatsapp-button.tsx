"use client";

import { useState, useRef, useEffect } from "react";
import { buildWhatsAppUrl, resolveTemplateVars } from "@/lib/utils";
import { logWhatsAppSent } from "@/lib/actions/contacts";
import { Icon } from "@/components/ui/icons";

interface Template {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface MemberInfo {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

interface WhatsAppButtonProps {
  member: MemberInfo;
  templates: Template[];
  vars: Record<string, string | null | undefined>;
  size?: "sm" | "md";
  redirect_to?: string;
}

export function WhatsAppButton({
  member,
  templates,
  vars,
  size = "sm",
  redirect_to,
}: WhatsAppButtonProps) {
  const [open, setOpen] = useState(false);
  const [sentType, setSentType] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSentType(null);
        setLogging(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSend = (template: Template) => {
    const message = resolveTemplateVars(template.content, vars);
    const url = buildWhatsAppUrl(member.phone, message);
    window.open(url, "_blank");
    setSentType(template.type);
  };

  const handleLog = () => {
    if (!sentType || logging) return;
    setLogging(true);
    const formData = new FormData();
    if (redirect_to) formData.set("redirect_to", redirect_to);
    logWhatsAppSent(member.id, sentType, formData);
  };

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const btnClass =
    size === "sm"
      ? "rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
      : "rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={btnClass}
        title="Send WhatsApp"
      >
        <Icon name="whatsapp" className={iconSize} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {!sentType ? (
            <>
              <div className="border-b border-zinc-100 px-3 py-2">
                <p className="text-xs font-semibold text-zinc-500">Send WhatsApp</p>
                <p className="text-xs text-zinc-400">{member.phone}</p>
              </div>
              {templates.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-400">No templates available.</p>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSend(t)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-zinc-50"
                  >
                    <span className="text-xs font-medium text-zinc-700">{t.name}</span>
                    <Icon name="whatsapp" className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                ))
              )}
            </>
          ) : (
            <div className="px-3 py-3">
              <p className="text-xs text-zinc-500">WhatsApp opened with message.</p>
              <p className="mb-2 text-xs text-zinc-400">Was it sent?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleLog}
                  disabled={logging}
                  className="flex-1 rounded-lg bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {logging ? "Logging..." : "Yes, log it"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSentType(null); setLogging(false); }}
                  disabled={logging}
                  className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
