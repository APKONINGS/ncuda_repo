"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCollectionAction } from "@/app/dashboard/actions";
import { Field, Input, Select, Textarea } from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";
import { watToday } from "@/lib/utils";

/**
 * Set up a project (collection) and what each person is expected to pay.
 * Executives and ordinary members usually contribute different amounts.
 */
export function CreateCollectionForm({ scopes }: { scopes: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState(createCollectionAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const err = (k: string) => state.fieldErrors?.[k];
  const keep = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  const bad = (k: string) => (err(k) ? true : undefined);
  const today = watToday();

  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="col-name" label="Project" error={err("name")}>
          <Input id="col-name" name="name" required maxLength={120} placeholder="e.g. Tractor purchase" defaultValue={keep("name")} aria-invalid={bad("name")} />
        </Field>
        <Field id="col-scope" label="Scope" error={err("scope")} hint={scopes.length === 1 ? undefined : "Who raises it."}>
          <Select id="col-scope" name="scope" required defaultValue={keep("scope", scopes[0]?.value)} aria-invalid={bad("scope")}>
            {scopes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="col-description" label="Purpose" error={err("description")}>
        <Textarea id="col-description" name="description" rows={2} required minLength={3} maxLength={300} className="min-h-20" placeholder="e.g. Buying a tractor for community farm work" defaultValue={keep("description")} aria-invalid={bad("description")} />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-ink-900">Amount (XAF)</legend>
        <p className="-mt-1 text-xs text-ink-500">Enter 0 to exempt a group.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="col-exec" label="Executives" error={err("executiveAmount")}>
            <MoneyInput key={`exec-${state.nonce ?? 0}`} id="col-exec" name="executiveAmount" required defaultValue={keep("executiveAmount")} aria-invalid={bad("executiveAmount")} />
          </Field>
          <Field id="col-member" label="Members" error={err("memberAmount")}>
            <MoneyInput key={`member-${state.nonce ?? 0}`} id="col-member" name="memberAmount" required defaultValue={keep("memberAmount")} aria-invalid={bad("memberAmount")} />
          </Field>
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="col-start" label="Start Date" error={err("startsOn")}>
          <Input id="col-start" name="startsOn" type="date" required defaultValue={keep("startsOn", today)} aria-invalid={bad("startsOn")} />
        </Field>
        <Field id="col-end" label="End Date" optional error={err("endsOn")}>
          <Input id="col-end" name="endsOn" type="date" defaultValue={keep("endsOn")} aria-invalid={bad("endsOn")} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Create New Project"}
        </Button>
      </div>
    </form>
  );
}
