"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SubmitButtonProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
  confirmMessage?: string;
  disabled?: boolean;
}

// Optional confirmMessage renders an in-app dialog instead of the native
// window.confirm — native dialogs are silently suppressed in iOS standalone
// PWAs and the submit quietly cancels.
export function SubmitButton({ children, className, label, confirmMessage, disabled }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <>
      <button
        type="submit"
        disabled={pending || disabled}
        className={className}
        aria-disabled={pending}
        onClick={
          confirmMessage
            ? (e) => {
                formRef.current = e.currentTarget.form;
                e.preventDefault();
                setConfirming(true);
              }
            : undefined
        }
      >
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {label ?? "Saving..."}
          </span>
        ) : (
          children
        )}
      </button>
      {confirmMessage && (
        <ConfirmDialog
          open={confirming}
          title={confirmMessage}
          confirmLabel="Confirm"
          danger
          busy={pending}
          onConfirm={() => {
            setConfirming(false);
            formRef.current?.requestSubmit();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
