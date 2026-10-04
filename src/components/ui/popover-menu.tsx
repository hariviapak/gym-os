"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Portal-based popover: rendered in document.body with position:fixed, so no
// card, container, or scroll area can ever clip it. It flips up when there
// isn't room below, clamps itself inside the viewport horizontally, closes on
// outside click, and any link/button inside closes it on activation.
export function PopoverMenu({
  trigger,
  children,
  align = "end",
  panelClassName = "w-44 py-1",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const pw = panelRef.current!.offsetWidth;
      const ph = panelRef.current!.offsetHeight;
      const margin = 6;
      // vertical: prefer below, flip up when there is no room
      const top = r.bottom + ph + margin > window.innerHeight ? Math.max(margin, r.top - ph - margin) : r.bottom + margin;
      // horizontal: align to the trigger edge, clamped inside the viewport
      const left = Math.min(
        Math.max(margin, align === "end" ? r.right - pw : r.left),
        window.innerWidth - pw - margin
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  return (
    <>
      <span ref={btnRef} className="inline-flex">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[70] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            data-popover-panel
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            onClick={(e) => {
              // close as soon as any action inside is activated — EXCEPT
              // server-action forms: closing unmounts the panel mid-click and
              // a detached form cannot submit, silently cancelling the action.
              // Dialog openers ([data-popover-keep]) also stay — unmounting
              // would kill the dialog they just opened.
              const t = e.target as HTMLElement;
              if (t.closest("form")) return;
              if (t.closest("[data-popover-keep]")) return;
              if (t.closest("button, a")) setOpen(false);
            }}
            className={`z-[80] overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-zinc-200 ${panelClassName}`}
          >
            {children}
          </div>
        </>
      )}
    </>
  );
}
