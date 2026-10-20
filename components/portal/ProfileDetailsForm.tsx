"use client";

import { useActionState, useState } from "react";
import { updateProfileAction } from "@/app/dashboard/actions";
import { Field, Input } from "@/components/forms/Field";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** A member edits their own name, email and phone. Changing the email (their sign-in) needs their password. */
export function ProfileDetailsForm({ fullName, email, phone }: { fullName: string; email: string; phone: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  const [newEmail, setNewEmail] = useState(email);
  const emailChanged = newEmail.trim().toLowerCase() !== email.toLowerCase();
  const err = (k: string) => state.fieldErrors?.[k];
  const aria = (k: string) => ({
    id: `me-${k}`,
    name: k,
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `me-${k}-error` : undefined,
  });

  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <Field id="me-fullName" label="Full name" error={err("fullName")}>
        <Input {...aria("fullName")} required defaultValue={state.values?.fullName ?? fullName} autoComplete="name" />
      </Field>
      <Field id="me-email" label="Email" error={err("email")} hint="This is the address you sign in with.">
        <Input {...aria("email")} type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
      </Field>
      {emailChanged && (
        <Field id="me-currentPassword" label="Current password" error={err("currentPassword")} hint="Needed to change your sign-in email.">
          <Input {...aria("currentPassword")} type="password" required autoComplete="current-password" />
        </Field>
      )}
      <Field id="me-phone" label="Phone" optional error={err("phone")}>
        <PhoneInput {...aria("phone")} defaultValue={state.values?.phone ?? phone} autoComplete="tel" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
