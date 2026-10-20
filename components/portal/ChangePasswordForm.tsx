"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePasswordAction } from "@/app/dashboard/actions";
import { Field, Input } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** A member changes their own password; the current one is required. */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const err = (k: string) => state.fieldErrors?.[k];
  const aria = (k: string) => ({
    id: `pw-${k}`,
    name: k,
    type: show ? "text" : "password",
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `pw-${k}-error` : undefined,
  });

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <FormMessage state={state} />
      <Field id="pw-current" label="Current password" error={err("current")}>
        <Input {...aria("current")} required autoComplete="current-password" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pw-next" label="New password" error={err("next")}>
          <Input {...aria("next")} required autoComplete="new-password" />
        </Field>
        <Field id="pw-confirm" label="Confirm new password" error={err("confirm")}>
          <Input {...aria("confirm")} required autoComplete="new-password" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-forest-800" />
          Show passwords
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
