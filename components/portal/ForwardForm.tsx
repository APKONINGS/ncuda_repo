"use client";

import { useActionState } from "react";
import { forwardMessageAction } from "@/app/dashboard/actions";
import { Field, Select, Textarea } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

export type ForwardOptions = {
  scopes: Array<{ value: string; label: string }>;
  roles: Array<{ key: string; name: string }>;
};

/**
 * Forward a received message, unchanged, to people within the forwarder's
 * own authority. Only a separate note can be added.
 */
export function ForwardForm({
  notificationId,
  title,
  options,
  onBack,
  onDone,
}: {
  notificationId: string;
  title: string;
  options: ForwardOptions;
  onBack: () => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(forwardMessageAction, {});

  if (state.ok) {
    return (
      <div className="grid gap-5 px-6 py-6">
        <FormMessage state={state} />
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="rounded-[var(--radius-sm)] bg-forest-800 px-5 py-2.5 text-sm font-medium text-paper hover:bg-forest-900">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5 overflow-y-auto px-6 py-5">
      <input type="hidden" name="notificationId" value={notificationId} />
      <FormMessage state={state} />

      <div className="rounded-[var(--radius-md)] border border-dashed border-line-strong bg-cream/50 px-4 py-3">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-500">Forwarding as received</p>
        <p className="mt-1 font-medium text-ink-900">{title}</p>
        <p className="mt-1 text-xs text-ink-500">Sent unchanged.</p>
      </div>

      <Field id="fwd-scope" label="Forward to members in" error={state.fieldErrors?.scope}>
        <Select id="fwd-scope" name="scope" required defaultValue={options.scopes[0]?.value}>
          {options.scopes.map((s) => (
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
          {options.roles.map((r) => (
            <label key={r.key} className="cursor-pointer">
              <input type="checkbox" name="roleKeys" value={r.key} className="peer sr-only" />
              <span className="inline-flex rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-700 transition-colors peer-checked:border-forest-800 peer-checked:bg-forest-800 peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600 hover:border-ink-300">
                {r.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="fwd-note" label="Your note" optional error={state.fieldErrors?.note} hint="Optional.">
        <Textarea id="fwd-note" name="note" rows={3} maxLength={500} className="min-h-24" />
      </Field>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← Back to message
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Forwarding…" : "Forward"}
        </Button>
      </div>
    </form>
  );
}
