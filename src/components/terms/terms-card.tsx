"use client";

import { useState } from "react";
import { statusColor, formatDate } from "@/lib/utils";
import { activateTermsVersion, updateTermsVersion } from "@/lib/actions/terms";
import { SubmitButton } from "@/components/ui/submit-button";

interface TermsVersion {
  id: string;
  version: string;
  title: string;
  body: string;
  status: string;
  category: string;
  effective_from: string | null;
  created_at: string;
}

interface TermsCardProps {
  version: TermsVersion;
  canEdit: boolean;
}

export function TermsCard({ version: v, canEdit }: TermsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            {v.title}{" "}
            <span className="text-sm font-normal text-zinc-400">v{v.version}</span>
          </h3>
          <p className="text-xs text-zinc-400">
            Created {formatDate(v.created_at)}
            {v.category === "swimming" ? " · Swimming Pool Rules" : " · Gym Terms"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(v.status)}`}>
            {v.status}
          </span>
          <button
            type="button"
            onClick={() => { setExpanded(!expanded); setEditing(false); }}
            className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900"
          >
            {expanded ? "Hide" : "View"}
          </button>
          {canEdit && v.status !== "draft" && (
            <button
              type="button"
              onClick={() => { setEditing(!editing); setExpanded(true); }}
              className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900"
            >
              {editing ? "Cancel Edit" : "Edit"}
            </button>
          )}
        </div>
      </div>

      {canEdit && v.status === "draft" && !editing && (
        <div className="mt-3">
          <form action={activateTermsVersion.bind(null, v.id)}>
            <button
              type="submit"
              className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
            >
              Activate
            </button>
          </form>
        </div>
      )}

      {expanded && !editing && (
        <div className="mt-3 max-h-96 overflow-y-auto rounded-lg bg-zinc-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-600">
            {v.body}
          </pre>
        </div>
      )}

      {expanded && editing && (
        <form action={updateTermsVersion.bind(null, v.id)} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Title</label>
            <input
              name="title"
              defaultValue={v.title}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Body</label>
            <textarea
              name="body"
              defaultValue={v.body}
              rows={16}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs leading-relaxed focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <SubmitButton
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            label="Saving..."
          >
            Save Changes
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
