"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { signIn, type SignInState } from "@/app/member-portal/actions";
import { Field, Input } from "@/components/forms/Field";
import { Arrow, Button } from "@/components/ui/Button";

export function SignInForm({
  next,
  demoAccounts,
  demoPassword,
}: {
  next?: string;
  demoAccounts?: Array<{ email: string; label: string; name?: string; group?: string }>;
  demoPassword?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [showPassword, setShowPassword] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const fillAccount = (email: string) => {
    if (idRef.current) idRef.current.value = email;
    if (pwRef.current && demoPassword) pwRef.current.value = demoPassword;
    pwRef.current?.focus();
  };

  return (
    <>
      <form action={action} className="grid gap-5">
        {next && <input type="hidden" name="next" value={next} />}

        {state.error && (
          <div role="alert" className="flex gap-3 rounded-[var(--radius-sm)] border border-danger/30 bg-earth-100/70 px-4 py-3 text-sm text-ink-900">
            <svg aria-hidden viewBox="0 0 12 12" className="mt-1 h-3 w-3 shrink-0 text-danger" fill="currentColor">
              <path d="M6 0 12 6 6 12 0 6Z" />
            </svg>
            {state.error}
          </div>
        )}

        <Field id="identifier" label="Email or username">
          <Input
            ref={idRef}
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            defaultValue={state.identifier}
            aria-invalid={state.error ? true : undefined}
          />
        </Field>

        <Field id="password" label="Password">
          <div className="relative">
            <Input
              ref={pwRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="pr-20"
              aria-invalid={state.error ? true : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-1 right-1 rounded-[var(--radius-xs)] px-3 text-xs font-medium text-ink-500 hover:bg-cream hover:text-forest-900"
              aria-pressed={showPassword}
              aria-controls="password"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <Link href="/member-portal/forgot-password" className="text-sm text-earth-700 underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full tracking-[0.08em] uppercase">
          {pending ? "Signing in…" : "Sign in"}
          {!pending && <Arrow />}
        </Button>
      </form>

      {demoAccounts && demoAccounts.length > 0 && (
        <details className="group mt-10 rounded-[var(--radius-md)] border border-dashed border-gold-500/60 bg-gold-100/40">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-gold-500 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-forest-950">Demo</span>
              Try a demonstration account
            </span>
            <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-gold-500/30 px-5 pb-5 pt-4">
            <p className="text-xs leading-relaxed text-ink-700">
              Demo password:{" "}
              <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[0.75rem]">{demoPassword}</code>.
            </p>
            <div className="mt-3 grid max-h-[28rem] gap-4 overflow-y-auto pr-1">
              {[...new Set(demoAccounts.map((a) => a.group ?? ""))].map((group) => (
                <div key={group}>
                  {group && <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-500">{group}</p>}
                  <ul className="grid gap-0.5">
                    {demoAccounts
                      .filter((a) => (a.group ?? "") === group)
                      .map((a) => (
                        <li key={a.email}>
                          <button
                            type="button"
                            onClick={() => fillAccount(a.email)}
                            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-1.5 text-left text-sm transition-colors hover:bg-paper"
                          >
                            <span className="font-medium text-forest-900">{a.name ?? a.label}</span>
                            <span className="truncate text-xs text-ink-500">{a.name ? a.label : a.email.split("@")[0]}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </>
  );
}
