"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContact } from "@/app/(public)/contact/actions";
import { Field, fieldAria, Input, Textarea } from "@/components/forms/Field";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { Arrow, Button } from "@/components/ui/Button";
import type { ContactState } from "@/lib/contact/schema";

const initial: ContactState = { status: "idle" };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle" && state.status !== "invalid") statusRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div ref={statusRef} tabIndex={-1} className="flex min-h-[28rem] flex-col justify-center outline-none" role="status">
        <svg aria-hidden viewBox="0 0 48 48" className="h-12 w-12 text-forest-700" fill="none">
          <path d="M24 2.5 45.5 24 24 45.5 2.5 24Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="m16 24 6 6 11-12" stroke="currentColor" strokeWidth="2" />
        </svg>
        <h2 className="display mt-6 text-4xl text-forest-900">Thank you.</h2>
        <p className="mt-4 max-w-md text-ink-700">Your message has been delivered to NCUDA. Someone will be in touch.</p>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.errors : {};
  const values = "values" in state ? state.values : {};

  return (
    <form action={action} noValidate className="grid gap-6" aria-describedby="contact-form-note">
      {state.status === "not_configured" && (
        <div ref={statusRef} tabIndex={-1} role="status" className="rounded-[var(--radius-md)] border border-gold-500/50 bg-gold-100 p-5 text-sm leading-relaxed text-ink-900 outline-none">
          <p className="font-semibold">Your message has not been sent.</p>
          <p className="mt-1 text-ink-700">
            Online delivery for this form has not been switched on yet. Your message is still in the form below — please
            copy it and send it to NCUDA directly, or try again later.
          </p>
        </div>
      )}
      {state.status === "error" && (
        <div ref={statusRef} tabIndex={-1} role="alert" className="rounded-[var(--radius-md)] border border-danger/40 bg-earth-100 p-5 text-sm text-ink-900 outline-none">
          <p className="font-semibold">Something went wrong and your message was not sent.</p>
          <p className="mt-1 text-ink-700">Please try again in a moment.</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="name" label="Full name" error={errors.name}>
          <Input {...fieldAria("name", errors.name)} autoComplete="name" required defaultValue={values.name} />
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          <Input {...fieldAria("email", errors.email)} type="email" autoComplete="email" required defaultValue={values.email} />
        </Field>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="phone" label="Phone" optional error={errors.phone}>
          <PhoneInput {...fieldAria("phone", errors.phone)} autoComplete="tel" defaultValue={values.phone} />
        </Field>
        <Field id="subject" label="Subject" error={errors.subject}>
          <Input {...fieldAria("subject", errors.subject)} required defaultValue={values.subject} />
        </Field>
      </div>
      <Field id="message" label="Message" error={errors.message}>
        <Textarea {...fieldAria("message", errors.message)} required rows={6} defaultValue={values.message} />
      </Field>

      {/* Honeypot */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p id="contact-form-note" className="max-w-xs text-xs leading-relaxed text-ink-500">
          We use your details only to reply to your message.
        </p>
        <Button type="submit" size="lg" disabled={pending} className="sm:min-w-44">
          {pending ? "Sending…" : "Send message"}
          {!pending && <Arrow />}
        </Button>
      </div>
    </form>
  );
}
