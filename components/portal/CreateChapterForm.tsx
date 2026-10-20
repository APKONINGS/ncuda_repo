"use client";

import { useActionState, useEffect, useRef } from "react";
import { createChapterAction } from "@/app/dashboard/actions";
import { Field, Input } from "@/components/forms/Field";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { AppointeePicker, type Candidate } from "@/components/portal/AppointeePicker";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

export function CreateChapterForm({
  regions,
  excoRoles,
  presidentCandidates,
}: {
  regions: Array<{ id: string; name: string }>;
  /** The other founding offices (the President is chosen separately). */
  excoRoles: Array<{ key: string; name: string }>;
  presidentCandidates: Candidate[];
}) {
  const [state, action, pending] = useActionState(createChapterAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  // Remount the President picker after a successful save so it starts fresh.
  const pickerKey = state.ok ? state.nonce : "draft";
  const err = (k: string) => state.fieldErrors?.[k];
  const aria = (k: string) => ({
    id: k,
    name: k,
    defaultValue: state.values?.[k] ?? "",
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `${k}-error` : undefined,
  });

  return (
    <form ref={formRef} action={action} className="grid gap-8">
      <FormMessage state={state} />

      <fieldset className="grid gap-5">
        <legend className="eyebrow text-earth-700">1 · The chapter</legend>
        <div className="grid gap-5 md:grid-cols-3">
          <Field id="name" label="Chapter name" error={err("name")}>
            <Input {...aria("name")} required />
          </Field>
          <Field id="location" label="Location" error={err("location")}>
            <Input {...aria("location")} required placeholder="Town / city" />
          </Field>
          <Field
            id="regionId"
            label="Region"
            error={err("regionId")}
          >
            {/* Fixed to the coordinator's region: shown, not editable. */}
            <>
              <input type="hidden" name="regionId" value={regions[0]?.id ?? ""} />
              <Input id="regionId" value={regions[0]?.name ?? ""} readOnly aria-readonly className="bg-cream text-ink-700 focus:ring-0 hover:border-line-strong" />
            </>
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="eyebrow text-earth-700">2 · Chapter President</legend>
        <AppointeePicker
          key={pickerKey}
          prefix="president"
          values={state.values}
          office="Chapter President"
          candidates={presidentCandidates}
          err={err}
          existingHint="Members who already hold an office in another chapter are not listed."
        />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="eyebrow text-earth-700">3 · Financial Secretary</legend>
        <AppointeePicker
          key={`fs-${pickerKey}`}
          prefix="financialSecretary"
          office="Financial Secretary"
          candidates={presidentCandidates}
          err={err}
          values={state.values}
          existingHint="Must be a different person from the Chapter President."
        />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="eyebrow text-earth-700">4 · Other founding officers (optional)</legend>
        <p className="-mt-1 text-sm text-ink-500">
          Optional.
        </p>
        {excoRoles.map((r) => (
          <div key={r.key} className="rounded-[var(--radius-md)] border border-line bg-paper p-4">
            <p className="text-sm font-semibold text-forest-900">{r.name}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field id={`exco.${r.key}.fullName`} label="Full name" error={err(`exco.${r.key}.fullName`)}>
                <Input {...aria(`exco.${r.key}.fullName`)} autoComplete="off" />
              </Field>
              <Field id={`exco.${r.key}.email`} label="Email" error={err(`exco.${r.key}.email`)}>
                <Input {...aria(`exco.${r.key}.email`)} type="email" autoComplete="off" />
              </Field>
              <Field id={`exco.${r.key}.phone`} label="Phone" optional error={err(`exco.${r.key}.phone`)}>
                <PhoneInput {...aria(`exco.${r.key}.phone`)} autoComplete="off" />
              </Field>
              <Field id={`exco.${r.key}.password`} label="Temporary password" error={err(`exco.${r.key}.password`)}>
                <Input {...aria(`exco.${r.key}.password`)} autoComplete="new-password" spellCheck={false} />
              </Field>
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create chapter"}
        </Button>
      </div>
    </form>
  );
}
