"use client";

import { useActionState, useState } from "react";
import { setMemberStatusAction } from "@/app/dashboard/actions";
import { Field, Textarea } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** Suspend or reinstate a member. A reason is always required and recorded. */
export function MemberStatusForm({ memberId, memberName, suspended }: { memberId: string; memberName: string; suspended: boolean }) {
  const [state, action, pending] = useActionState(setMemberStatusAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) return <FormMessage state={state} />;

  if (!open) {
    return (
      <Button type="button" variant={suspended ? "primary" : "danger"} onClick={() => setOpen(true)}>
        {suspended ? "Reinstate membership" : "Suspend membership"}
      </Button>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
      <FormMessage state={state} />
      {!suspended && (
        <p className="rounded-[var(--radius-sm)] border border-danger/30 bg-earth-100/60 px-4 py-3 text-sm leading-relaxed text-ink-900">
          <strong>{memberName}</strong> will be signed out. Records are kept.
        </p>
      )}
      <Field id="status-reason" label={suspended ? "Reason for reinstating" : "Reason for suspension"} error={state.fieldErrors?.reason}>
        <Textarea id="status-reason" name="reason" required minLength={5} maxLength={500} rows={3} className="min-h-24" />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant={suspended ? "primary" : "danger"} disabled={pending}>
          {pending ? "Saving…" : suspended ? "Reinstate" : "Suspend"}
        </Button>
      </div>
    </form>
  );
}
