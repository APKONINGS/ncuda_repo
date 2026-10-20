"use client";

import { useActionState } from "react";
import { appointCoordinatorAction, createRegionAction } from "@/app/dashboard/actions";
import { Field, Input } from "@/components/forms/Field";
import { AppointeePicker, type Candidate } from "@/components/portal/AppointeePicker";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

const HINT = "Anyone already in the portal, from any chapter.";

/** Creates a region together with its Regional Coordinator. */
export function CreateRegionForm({ candidates }: { candidates: Candidate[] }) {
  const [state, action, pending] = useActionState(createRegionAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-6">
      <FormMessage state={state} />
      {/* Remounted after each successful save so every field starts fresh. */}
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-6">
        <Field id="region-name" label="Region name" error={err("name")}>
          <Input id="region-name" name="name" required maxLength={120} placeholder="e.g. North-West" defaultValue={state.values?.name ?? ""} aria-invalid={err("name") ? true : undefined} />
        </Field>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-ink-900">Regional Coordinator</legend>
          <AppointeePicker prefix="coordinator" office="Regional Coordinator" candidates={candidates} err={err} existingHint={HINT} values={state.values} />
        </fieldset>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create region"}
        </Button>
      </div>
    </form>
  );
}

/** Appoints a coordinator to a region that has none. */
export function AppointCoordinatorForm({ regionId, regionName, candidates }: { regionId: string; regionName: string; candidates: Candidate[] }) {
  const [state, action, pending] = useActionState(appointCoordinatorAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="regionId" value={regionId} />
      <FormMessage state={state} />
      <AppointeePicker prefix="coordinator" office={`Regional Coordinator of ${regionName}`} candidates={candidates} err={err} existingHint={HINT} values={state.values} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Appointing…" : "Appoint coordinator"}
        </Button>
      </div>
    </form>
  );
}
