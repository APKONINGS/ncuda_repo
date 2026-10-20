"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/forms/Field";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { cn } from "@/lib/utils";

/** A member who could be picked. `disabled`: they hold a post and must give it up first. */
export type Candidate = { id: string; label: string; disabled?: boolean };

/**
 * Who will lead a new region or chapter: someone already in the portal, or a
 * new person whose account is created with it. Submits "<prefix>.mode" plus
 * either "<prefix>.memberId" or "<prefix>.fullName/.email/.phone".
 */
export function AppointeePicker({
  prefix,
  office,
  candidates,
  err,
  existingHint,
  values,
}: {
  prefix: string;
  /** e.g. "Regional Coordinator" */
  office: string;
  candidates: Candidate[];
  err: (k: string) => string | undefined;
  existingHint?: string;
  /** What was typed before a refused submission. */
  values?: Record<string, string>;
}) {
  const [mode, setMode] = useState<"new" | "existing">(values?.[`${prefix}.mode`] === "existing" ? "existing" : "new");
  const id = (k: string) => `${prefix}.${k}`;
  const aria = (k: string) => ({
    id: id(k),
    name: id(k),
    defaultValue: values?.[id(k)] ?? "",
    "aria-invalid": err(id(k)) ? true : undefined,
    "aria-describedby": err(id(k)) ? `${id(k)}-error` : undefined,
  });

  return (
    <div className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-paper p-4">
      <input type="hidden" name={id("mode")} value={mode} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">How to choose the {office}</legend>
        {(
          [
            ["new", "Create a new person"],
            ["existing", "Choose someone already in the portal"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="cursor-pointer">
            <input type="radio" name={`${prefix}-mode-choice`} value={value} checked={mode === value} onChange={() => setMode(value)} className="peer sr-only" />
            <span
              className={cn(
                "inline-block rounded-full border px-3.5 py-2 text-sm transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600",
                mode === value ? "border-forest-800 bg-forest-800 text-paper" : "border-line-strong text-ink-700 hover:bg-cream",
              )}
            >
              {label}
            </span>
          </label>
        ))}
      </fieldset>

      {mode === "existing" ? (
        <Field id={id("memberId")} label={office} error={err(id("memberId"))} hint={candidates.length ? existingHint : "Nobody available — add a new person."}>
          <Select {...aria("memberId")} required disabled={candidates.length === 0}>
            <option value="" disabled>
              Choose a member…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id} disabled={c.disabled}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field id={id("fullName")} label="Full name" error={err(id("fullName"))}>
            <Input {...aria("fullName")} required autoComplete="off" />
          </Field>
          <Field id={id("email")} label="Email" error={err(id("email"))} hint="Their sign-in address.">
            <Input {...aria("email")} type="email" required autoComplete="off" />
          </Field>
          <Field id={id("phone")} label="Phone" optional error={err(id("phone"))} hint="At least 6 digits; a leading + is allowed.">
            <PhoneInput {...aria("phone")} autoComplete="off" />
          </Field>
          <Field id={id("password")} label="Temporary password" error={err(id("password"))} hint="Share it privately.">
            <Input {...aria("password")} required autoComplete="new-password" spellCheck={false} />
          </Field>
        </div>
      )}
    </div>
  );
}
