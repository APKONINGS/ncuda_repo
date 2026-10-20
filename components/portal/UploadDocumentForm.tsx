"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadDocumentAction } from "@/app/dashboard/actions";
import { Field, FileInput, Input, Select } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

const CATEGORIES = [
  ["association", "Association document"],
  ["minutes", "Meeting minutes"],
  ["reports", "Report"],
  ["financial", "Financial document"],
  ["forms", "Form"],
  ["other", "Other"],
] as const;

/** Upload a document and choose exactly who can view it. They are notified. */
export function UploadDocumentForm({
  scopes,
  roles,
}: {
  scopes: Array<{ value: string; label: string }>;
  roles: Array<{ key: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(uploadDocumentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <FormMessage state={state} />

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="up-title" label="Title" error={err("title")}>
          <Input id="up-title" name="title" required maxLength={160} placeholder="e.g. Year-end report 2026" />
        </Field>
        <Field id="up-category" label="Category" error={err("category")}>
          <Select id="up-category" name="category" defaultValue="association">
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field id="up-file" label="File" error={err("file")} hint="Up to 10 MB.">
        <FileInput id="up-file" name="file" required invalid={!!err("file")} />
      </Field>

      <fieldset className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-paper p-4">
        <legend className="px-1 text-sm font-semibold text-forest-900">Who can view it</legend>
        <Field id="up-scope" label="Members in" error={err("scope")}>
          <Select id="up-scope" name="scope" required defaultValue={scopes[0]?.value}>
            {scopes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="text-sm font-medium text-ink-900">Only these office holders</p>
          <p className="mt-1 text-xs text-ink-500">None ticked: everyone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {roles.map((r) => (
              <label key={r.key} className="cursor-pointer">
                <input type="checkbox" name="roleKeys" value={r.key} className="peer sr-only" />
                <span className="inline-flex rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-700 transition-colors peer-checked:border-forest-800 peer-checked:bg-forest-800 peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600 hover:border-ink-300">
                  {r.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Uploading…" : "Upload & share"}
        </Button>
      </div>
    </form>
  );
}
