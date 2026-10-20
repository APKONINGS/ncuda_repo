"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessageAction } from "@/app/dashboard/actions";
import { Field, FileInput, Input, Select, Textarea } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** Compose a message to a scope, optionally narrowed to holders of selected roles. */
export function ComposeMessage({
  scopes,
  roles,
}: {
  scopes: Array<{ value: string; label: string }>;
  roles: Array<{ key: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <FormMessage state={state} />

      <Field id="scope" label="Send to members in" error={err("scope")}>
        <Select id="scope" name="scope" required defaultValue={scopes[0]?.value}>
          {scopes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Only these office holders</legend>
        <p className="mt-1 text-xs text-ink-500">None ticked: everyone.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <label key={r.key} className="cursor-pointer">
              <input type="checkbox" name="roleKeys" value={r.key} className="peer sr-only" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-700 transition-colors peer-checked:border-forest-800 peer-checked:bg-forest-800 peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600 hover:border-ink-300">
                {r.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="title" label="Subject" error={err("title")}>
        <Input id="title" name="title" required maxLength={140} />
      </Field>
      <Field id="body" label="Message" error={err("body")}>
        <Textarea id="body" name="body" required rows={6} maxLength={4000} />
      </Field>

      <Field
        id="attachments"
        label="Attach documents"
        optional
        error={err("attachments")}
        hint="Up to 5 files, 10 MB each."
      >
        <FileInput id="attachments" name="attachments" multiple invalid={!!err("attachments")} />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
