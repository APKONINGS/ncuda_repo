"use client";

import { useActionState, useState } from "react";
import { recordExpenseAction } from "@/app/dashboard/actions";
import { Field, Input, Select } from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";
import { formatMoney, watToday } from "@/lib/utils";

export type SendableProject = { scope: string; value: string; label: string; recipientName: string; collected: number; sent: number };

/**
 * Records money taken out of a chapter's, region's or the central funds — or,
 * from a chapter, project money sent to the project manager (creator of the project's
 * committees (who disburses it to them).
 */
export function RecordExpenseForm({ scopes, projects = [] }: { scopes: Array<{ value: string; label: string }>; projects?: SendableProject[] }) {
  const [state, action, pending] = useActionState(recordExpenseAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const keep = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  const bad = (k: string) => (err(k) ? true : undefined);
  const today = watToday();
  const [kind, setKind] = useState(keep("kind", "expense"));
  const [scope, setScope] = useState(keep("scope", scopes[0]?.value ?? ""));
  const [projectId, setProjectId] = useState(keep("sendFor"));
  const forScope = projects.filter((p) => p.scope === scope);
  const project = forScope.find((p) => p.value === projectId);
  const sending = kind === "send";

  return (
    <form action={action} className="grid gap-5">
      <FormMessage state={state} />
      {projects.length > 0 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium text-ink-900">What is this?</legend>
          {[
            ["expense", "An expense"],
            ["send", "Send money to project manager"],
          ].map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="peer sr-only" />
              <span className="inline-block rounded-full border border-line px-3 py-1.5 text-sm text-ink-700 peer-checked:border-forest-800 peer-checked:bg-forest-800 peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600">
                {label}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {/* Remounted after each successful save so every field starts fresh. */}
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="ex-scope" label={sending ? "Sent from" : "Paid from"} error={err("scope")}>
            <Select
              id="ex-scope"
              name="scope"
              required
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setProjectId("");
              }}
              aria-invalid={bad("scope")}
            >
              {(sending ? scopes.filter((s) => projects.some((p) => p.scope === s.value)) : scopes).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {sending ? (
            <Field
              id="ex-project"
              label="Project"
              error={err("sendFor")}
              hint={
                project
                  ? `Goes to ${project.recipientName}, the project manager. Collected here ${formatMoney(project.collected)} · already sent ${formatMoney(project.sent)} · available to send ${formatMoney(Math.max(0, project.collected - project.sent))}.`
                  : "Only projects that have a committee are listed."
              }
            >
              <Select id="ex-project" name="sendFor" required value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-invalid={bad("sendFor")}>
                <option value="" disabled>
                  Choose a project…
                </option>
                {forScope.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field id="ex-description" label="Spent on" error={err("description")}>
              <Input id="ex-description" name="description" required minLength={3} maxLength={200} placeholder="e.g. Refreshments for the October general meeting" defaultValue={keep("description")} aria-invalid={bad("description")} />
            </Field>
          )}
        </div>
        <div className={`grid gap-5 ${sending ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {!sending && (
            <Field id="ex-paidto" label="Paid to" optional error={err("paidTo")}>
              <Input id="ex-paidto" name="paidTo" maxLength={120} placeholder="e.g. Caterer" defaultValue={keep("paidTo")} aria-invalid={bad("paidTo")} />
            </Field>
          )}
          <Field id="ex-amount" label={sending ? "Amount sent (XAF)" : "Amount (XAF)"} error={err("amount")}>
            <MoneyInput key={`amount-${state.nonce ?? 0}`} id="ex-amount" name="amount" required defaultValue={keep("amount")} aria-invalid={bad("amount")} />
          </Field>
          <Field id="ex-date" label={sending ? "Date sent" : "Date spent"} error={err("spentOn")}>
            <Input id="ex-date" name="spentOn" type="date" max={today} defaultValue={keep("spentOn", today)} required aria-invalid={bad("spentOn")} />
          </Field>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : sending ? "Record money sent" : "Record expense"}
        </Button>
      </div>
    </form>
  );
}
