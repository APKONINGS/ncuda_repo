"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetState } from "@/app/member-portal/actions";
import { Field, Input } from "@/components/forms/Field";
import { Button } from "@/components/ui/Button";

export function ResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordReset, { status: "idle" });
  return (
    <form action={action} className="grid gap-5">
      {state.status === "unavailable" && (
        <div role="status" className="rounded-[var(--radius-sm)] border border-gold-500/50 bg-gold-100 px-4 py-3 text-sm leading-relaxed text-ink-900">
          <p className="font-semibold">Reset by email is not on yet.</p>
          <p className="mt-1 text-ink-700">No email was sent. Ask your chapter secretary.</p>
        </div>
      )}
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" variant="secondary" size="lg" disabled={pending} className="w-full">
        {pending ? "Please wait…" : "Send reset link"}
      </Button>
    </form>
  );
}
