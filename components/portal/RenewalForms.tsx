"use client";

import { useActionState } from "react";
import { cancelRenewalAction, startRenewalAction } from "@/app/dashboard/actions";
import { Field, Input, Textarea } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** Start the yearly registration renewal: every account becomes inactive until its fee is paid. */
export function StartRenewalForm({ suggestedYear }: { suggestedYear: number }) {
  const [state, action, pending] = useActionState(startRenewalAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const keep = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  const bad = (k: string) => (err(k) ? true : undefined);
  return (
    <form action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="rn-year" label="Year" error={err("year")}>
          <Input id="rn-year" name="year" inputMode="numeric" required defaultValue={keep("year", String(suggestedYear))} aria-invalid={bad("year")} />
        </Field>
      </div>
      <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-gold-500/60 bg-gold-100/50 p-4 text-sm text-ink-900">
        <input type="checkbox" name="confirm" required aria-invalid={bad("confirm")} defaultChecked={keep("confirm") === "on"} className="mt-0.5 h-4 w-4 accent-forest-800" />
        <span>
          I understand that <strong>every account becomes inactive</strong> — executives and mine included — until its registration for that year is recorded at its chapter.
          Inactive members can still sign in; officers keep only their setup work, and Financial Secretaries can still record registration payments.
          {err("confirm") && <span className="mt-1 block text-xs font-medium text-danger">{err("confirm")}</span>}
        </span>
      </label>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Starting…" : "Start registration renewal"}
        </Button>
      </div>
    </form>
  );
}

/** Undo the current renewal (e.g. started by mistake). */
export function CancelRenewalForm({ year }: { year: number }) {
  const [state, action, pending] = useActionState(cancelRenewalAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-3">
      <FormMessage state={state} />
      <Field id="rn-reason" label={`Reason for cancelling Registration ${year}`} error={err("reason")}>
        <Textarea id="rn-reason" name="reason" required minLength={5} className="min-h-20" defaultValue={state.values?.reason ?? ""} aria-invalid={err("reason") ? true : undefined} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel this renewal"}
        </Button>
      </div>
    </form>
  );
}
