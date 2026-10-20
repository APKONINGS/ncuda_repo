"use client";

import { useActionState, useState } from "react";
import { recordContributionAction } from "@/app/dashboard/actions";
import { Field, Input, Select } from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";
import { formatMoney, watToday } from "@/lib/utils";

type Payer = {
  value: string;
  label: string;
  chapterId: string | null;
  executive: boolean;
  /** Their chapter's registration fee (null until its Financial Secretary sets it). */
  registrationFee: number | null;
  /** Paid so far towards each project. */
  paid: Record<string, number>;
  /** Earlier fines in this ledger that still have a balance. */
  fines: Array<{ id: string; description: string; balance: number }>;
};
type Project = {
  id: string;
  name: string;
  purpose: string;
  expected: { executive: number; member: number };
  chapterIds?: string[];
};

const readOnlyClasses =
  "bg-cream text-ink-700 focus:ring-0 hover:border-line-strong";

/**
 * Records a payment. For a contribution the project supplies the
 * description (its purpose) and the expected amount (executive or member
 * rate); for a fine the officer writes the reason and the fine imposed, or
 * picks an earlier fine that is still being paid off. Receipt numbers are
 * generated on the server. The server re-derives and re-checks everything.
 *
 *  - mode "chapter": a chapter Financial Secretary, for members of their chapter(s).
 *  - mode "central": the National Financial Secretary, for members paying the
 *    centre directly.
 * After a refused submission, what was typed is kept; only wrong fields are cleared.
 */
export function RecordPaymentForm({
  mode,
  payers,
  projects,
}: {
  mode: "chapter" | "central";
  payers: Payer[];
  projects: Project[];
}) {
  const [state, action, pending] = useActionState(recordContributionAction, {});
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="ledger" value={mode} />
      <FormMessage state={state} />
      {/* Remounted after each successful save so every field starts fresh. */}
      <PaymentFields
        key={state.ok ? state.nonce : "draft"}
        mode={mode}
        payers={payers}
        projects={projects}
        err={(k) => state.fieldErrors?.[k]}
        values={state.values}
        refusedAt={!state.ok && state.nonce ? state.nonce : 0}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Record"}
        </Button>
      </div>
    </form>
  );
}

function PaymentFields({
  mode,
  payers,
  projects,
  err,
  values,
  refusedAt,
}: {
  mode: "chapter" | "central";
  payers: Payer[];
  projects: Project[];
  err: (k: string) => string | undefined;
  values?: Record<string, string>;
  /** When the last submission was refused (0 if none). */
  refusedAt: number;
}) {
  const [payerValue, setPayerValue] = useState("");
  const [type, setType] = useState<"contribution" | "fine">("contribution");
  const [projectId, setProjectId] = useState("");
  const [fineId, setFineId] = useState("new");
  const [paidNow, setPaidNow] = useState(values?.paidNow ?? "");
  const today = watToday();

  const payer = payers.find((p) => p.value === payerValue);
  const available =
    mode === "central"
      ? projects
      : projects.filter(
          (p) => payer?.chapterId && p.chapterIds?.includes(payer.chapterId),
        );
  const project = available.find((p) => p.id === projectId);
  const earlierFine = payer?.fines.find((f) => f.id === fineId);

  // What the payer is expected to pay, and what is already in.
  // Registration is the chapter's fee, the same for everyone; a project depends on executive or member.
  const expected = project && payer ? (payer.executive ? project.expected.executive : project.expected.member) : null;
  const already = project && payer ? (payer.paid[project.id] ?? 0) : 0;

  const onPayer = (value: string) => {
    setPayerValue(value);
    setProjectId("");
    setFineId("new");
  };

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="payer"
          label={mode === "central" ? "Received from" : "Member"}
          error={err(mode === "central" ? "payer" : "memberId")}
        >
          <Select
            id="payer"
            name={mode === "central" ? "payer" : "memberId"}
            required
            value={payerValue}
            onChange={(e) => onPayer(e.target.value)}
          >
            <option value="" disabled>
              Choose a member…
            </option>
            {payers.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="type" label="Type" error={err("type")}>
          <Select
            id="type"
            name="type"
            required
            value={type}
            onChange={(e) => {
              setType(e.target.value as "contribution" | "fine");
              setProjectId("");
              setFineId("new");
            }}
          >
            <option value="contribution">Contribution</option>
            <option value="fine">Fine</option>
          </Select>
        </Field>
      </div>

      <>
        {/* Project first: for a contribution it decides the description and the expected amount. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="collectionId"
            label="Project"
            error={err("collectionId")}
            hint={
              type === "fine"
                ? "Fines are not part of a project."
                : !payer
                  ? `Choose ${mode === "central" ? "who paid" : "a member"} first.`
                  : available.length === 0
                    ? "No projects apply to this member yet."
                    : mode === "central"
                      ? "Organisation-wide projects only."
                      : undefined
            }
          >
            {type !== "contribution" ? (
              <Select id="collectionId" value="" disabled aria-readonly>
                <option value="">Not part of a project</option>
              </Select>
            ) : (
              <Select
                id="collectionId"
                name="collectionId"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!payer || available.length === 0}
              >
                <option value="" disabled>
                  Choose a project…
                </option>
                {available.map((p) => {
                  const done = (payer?.paid[p.id] ?? 0) > 0;
                  return (
                    <option key={p.id} value={p.id} disabled={done}>
                      {p.name}
                      {done ? " (paid)" : ""}
                    </option>
                  );
                })}
              </Select>
            )}
          </Field>

          {type === "contribution" ? (
            <Field
              id="description"
              label="Description"
            >
              <Input
                key="from-project"
                id="description"
                value={project?.purpose ?? ""}
                placeholder="Filled in from the project"
                readOnly
                className={readOnlyClasses}
              />
            </Field>
          ) : earlierFine ? (
            <Field
              id="description"
              label="Description"
              hint="The reason given when this fine was imposed."
            >
              <Input
                key="from-fine"
                id="description"
                value={earlierFine.description}
                readOnly
                className={readOnlyClasses}
              />
            </Field>
          ) : (
            <Field
              id="description"
              label="Description"
              error={err("description")}
              hint="The reason for the fine."
            >
              <Input
                key="typed"
                id="description"
                name="description"
                required
                minLength={3}
                maxLength={200}
                defaultValue={values?.description ?? ""}
                aria-invalid={err("description") ? true : undefined}
                placeholder="e.g. Late arrival at the 12 October meeting"
              />
            </Field>
          )}
        </div>

        {type === "fine" && payer && payer.fines.length > 0 && (
          <Field
            id="fineId"
            label="Fine"
            error={err("fineId")}
            hint="Choose an imposed fine if this is its payment."
          >
            <Select
              id="fineId"
              name="fineId"
              value={fineId}
              onChange={(e) => setFineId(e.target.value)}
            >
              <option value="new">A new fine</option>
              {payer.fines.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.description} — {formatMoney(f.balance)} owed
                </option>
              ))}
            </Select>
          </Field>
        )}

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-ink-900">
            Amount (XAF)
          </legend>
          <div className="grid gap-5 sm:grid-cols-3">
            {type === "contribution" ? (
              <Field
                id="expectedAmount"
                label="Amount paid"
                hint={
                  expected === null
                    ? "Shown once a member and project are chosen."
                    : already
                      ? "Already paid."
                      : `The full ${payer?.executive ? "executive" : "member"} amount.`
                }
              >
                <Input
                  key="from-project"
                  id="expectedAmount"
                  value={expected === null ? "" : expected.toLocaleString("en-GB")}
                  readOnly
                  className={`${readOnlyClasses} num`}
                  placeholder="—"
                />
              </Field>
            ) : earlierFine ? (
              <Field id="expectedAmount" label="Amount paid" hint="The full fine.">
                <Input
                  key="from-fine"
                  id="expectedAmount"
                  value={earlierFine.balance.toLocaleString("en-GB")}
                  readOnly
                  className={`${readOnlyClasses} num`}
                />
              </Field>
            ) : (
              <>
                <Field id="expectedAmount" label="Fine imposed" error={err("expectedAmount")}>
                  <MoneyInput
                    key={`typed-${refusedAt}`}
                    id="expectedAmount"
                    name="expectedAmount"
                    required
                    defaultValue={values?.expectedAmount ?? ""}
                    aria-invalid={err("expectedAmount") ? true : undefined}
                  />
                </Field>
                <Field id="paidNow" label="Paid now?" error={err("paidNow")}>
                  <Select
                    id="paidNow"
                    name="paidNow"
                    required
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                    aria-invalid={err("paidNow") ? true : undefined}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    <option value="yes">Yes — paid in full now</option>
                    <option value="no">No — to be paid later, in full</option>
                  </Select>
                </Field>
              </>
            )}
            <Field
              id="receivedOn"
              label="Date received"
              error={err("receivedOn")}
            >
              <Input
                id="receivedOn"
                name="receivedOn"
                type="date"
                max={today}
                defaultValue={values?.receivedOn ?? today}
                required
                aria-invalid={err("receivedOn") ? true : undefined}
              />
            </Field>
          </div>
        </fieldset>
      </>
    </>
  );
}
