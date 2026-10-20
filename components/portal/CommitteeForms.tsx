"use client";

import { useActionState, useRef, useState } from "react";
import {
  addCommitteeMemberAction,
  createCommitteeAction,
  dissolveCommitteeAction,
  recordDisbursementAction,
  removeCommitteeMemberAction,
  saveCommitteeMinutesAction,
  scheduleCommitteeMeetingAction,
  sendCommitteeMessageAction,
  setCommitteeMeetingStatusAction,
  setCommitteePositionAction,
  uploadCommitteeDocumentAction,
  type FormState,
} from "@/app/dashboard/actions";
import { Field, FileInput, Input, Select, Textarea } from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";
import { formatMoney, watToday } from "@/lib/utils";

type Option = { value: string; label: string };
const keep = (s: FormState, k: string, fallback = "") => s.values?.[k] ?? fallback;
const bad = (s: FormState, k: string) => (s.fieldErrors?.[k] ? true : undefined);

type ProjectOption = { value: string; scope: string; label: string; description: string; executive: number; member: number; startsOn: string; endsOn: string | null; committees: number };

/** Create a committee for a project set up beforehand under Finances → Collections. */
export function CreateCommitteeForm({ scopes, projects }: { scopes: Option[]; projects: ProjectOption[] }) {
  const [state, action, pending] = useActionState(createCommitteeAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const [scope, setScope] = useState(keep(state, "scope", scopes[0]?.value ?? ""));
  const [projectId, setProjectId] = useState(keep(state, "collectionId"));
  const available = projects.filter((p) => p.scope === scope);
  const project = available.find((p) => p.value === projectId);
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <form action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="cm-name" label="Committee name" error={err("name")}>
            <Input id="cm-name" name="name" required maxLength={120} placeholder="e.g. Tractor Committee" defaultValue={keep(state, "name")} aria-invalid={bad(state, "name")} />
          </Field>
          <Field id="cm-scope" label="Scope" error={err("scope")} >
            <Select
              id="cm-scope"
              name="scope"
              required
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setProjectId("");
              }}
              aria-invalid={bad(state, "scope")}
            >
              {scopes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          id="cm-project"
          label="Project"
          error={err("collectionId")}
          hint={available.length === 0 ? undefined : "Created under Finances → Contributions."}
        >
          <Select id="cm-project" name="collectionId" required value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={available.length === 0} aria-invalid={bad(state, "collectionId")}>
            <option value="" disabled>
              {available.length === 0 ? "No project for this scope yet" : "Choose a project…"}
            </option>
            {available.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
                {p.committees > 0 ? ` (${p.committees} committee${p.committees === 1 ? "" : "s"} already)` : ""}
              </option>
            ))}
          </Select>
        </Field>
        {available.length === 0 && (
          <p className="rounded-[var(--radius-md)] border border-line bg-paper p-4 text-sm text-ink-700">
            There is no current project for this scope.{" "}
            {scope === "organization" ? "The National Financial Secretary" : scope.startsWith("chapter:") ? "The chapter's Financial Secretary" : "You"} first create
            {scope === "organization" || scope.startsWith("chapter:") ? "s" : ""} a New Project under{" "}
            <a href="/dashboard/finances?tab=collections" className="font-medium text-forest-900 underline underline-offset-4">
              Finances → Contributions
            </a>
            , for {scope === "organization" ? "the whole organisation" : scope.startsWith("chapter:") ? "this chapter" : "this region"}.
          </p>
        )}
        {project && (
          <dl className="grid gap-2 rounded-[var(--radius-md)] border border-line bg-paper p-4 text-sm sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]">
            <dt className="text-ink-500">Purpose</dt>
            <dd className="text-ink-900">{project.description}</dd>
            <dt className="text-ink-500">Amounts</dt>
            <dd className="text-ink-900">
              Executives {formatMoney(project.executive)} · Members {formatMoney(project.member)}
            </dd>
            <dt className="text-ink-500">Dates</dt>
            <dd className="text-ink-900">
              {date(project.startsOn)} → {project.endsOn ? date(project.endsOn) : "no end date"}
            </dd>
          </dl>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending || available.length === 0}>
          {pending ? "Creating…" : "Create committee"}
        </Button>
      </div>
    </form>
  );
}

/** The creator adds a person, with or without a position. */
export function AddCommitteeMemberForm({ committeeId, candidates, positions }: { committeeId: string; candidates: Array<{ id: string; label: string; disabled: boolean }>; positions: Option[] }) {
  const [state, action, pending] = useActionState(addCommitteeMemberAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="committeeId" value={committeeId} />
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4 sm:grid-cols-2">
        <Field id="cmm-member" label="Member" error={err("memberId")} hint="One committee per person.">
          <Select id="cmm-member" name="memberId" required defaultValue={keep(state, "memberId")} aria-invalid={bad(state, "memberId")}>
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
        <Field id="cmm-position" label="Position" error={err("position")}>
          <Select id="cmm-position" name="position" defaultValue={keep(state, "position")} aria-invalid={bad(state, "position")}>
            <option value="">Ordinary member (no position)</option>
            {positions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add to committee"}
        </Button>
      </div>
    </form>
  );
}

/** The creator changes a member's position (inline). */
export function CommitteePositionForm({ membershipId, current, positions }: { membershipId: string; current: string | null; positions: Option[] }) {
  const [state, action, pending] = useActionState(setCommitteePositionAction, {});
  const options = current ? [{ value: current, label: positions.find((p) => p.value === current)?.label ?? current }, ...positions.filter((p) => p.value !== current)] : positions;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label className="sr-only" htmlFor={`pos-${membershipId}`}>
        Position
      </label>
      <select id={`pos-${membershipId}`} name="position" defaultValue={current ?? ""} className="h-9 rounded-[var(--radius-sm)] border border-line-strong bg-paper px-2 text-sm">
        <option value="">Ordinary member</option>
        {options.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <Button type="submit" variant="ghost" size="sm" className="border border-line-strong" disabled={pending}>
        {pending ? "…" : "Change"}
      </Button>
      {state.error && <span className="w-full text-xs text-danger">{state.error}</span>}
    </form>
  );
}

/** The creator takes someone off the committee (reason required). */
export function RemoveCommitteeMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(removeCommitteeMemberAction, {});
  if (state.ok) return <span className="text-xs text-ink-500">Removed</span>;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-100">
        Remove<span className="sr-only"> {name}</span>
      </button>
      {open && (
        <form action={action} className="absolute right-0 top-full z-20 mt-2 grid w-72 gap-3 rounded-[var(--radius-md)] border border-line bg-paper p-4 text-left shadow-[var(--shadow-lift)]">
          <input type="hidden" name="membershipId" value={membershipId} />
          <FormMessage state={state} />
          <label htmlFor={`rm-${membershipId}`} className="text-sm font-medium text-ink-900">
            Reason
          </label>
          <Input id={`rm-${membershipId}`} name="reason" required minLength={3} placeholder="e.g. Stepped down" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The creator dissolves the committee: a dialog asks for the reason first. */
export function DissolveCommitteeButton({ committeeId, name }: { committeeId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(dissolveCommitteeAction, {});
  return (
    <>
      <Button type="button" variant="danger" onClick={() => dialog.current?.showModal()}>
        Dissolve committee
      </Button>
      <dialog ref={dialog} aria-labelledby="dissolve-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-line bg-paper p-0 text-ink-900 shadow-[var(--shadow-lift)] backdrop:bg-ink-900/40">
        <form action={action} className="grid gap-4 p-6">
          <input type="hidden" name="committeeId" value={committeeId} />
          <h2 id="dissolve-title" className="font-display text-xl text-forest-900">
            Dissolve “{name}”?
          </h2>
          <p className="text-sm text-ink-700">
            Members are freed; records are kept.
          </p>
          <FormMessage state={state} />
          <Field id="dissolve-reason" label="Reason for dissolving" error={state.fieldErrors?.reason}>
            <Textarea id="dissolve-reason" name="reason" required minLength={5} className="min-h-24" placeholder="e.g. The tractor has been bought and handed over." defaultValue={keep(state, "reason")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Dissolving…" : "Dissolve committee"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** A committee message with attachments: President → creator, or creator → committee. */
export function CommitteeMessageForm({ committeeId, to, toLabel }: { committeeId: string; to: "creator" | "committee"; toLabel: string }) {
  const [state, action, pending] = useActionState(sendCommitteeMessageAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="committeeId" value={committeeId} />
      <input type="hidden" name="to" value={to} />
      <FormMessage state={state} />
      <p className="text-sm text-ink-700">
        To: <span className="font-medium text-ink-900">{toLabel}</span>
      </p>
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4">
        <Field id={`msg-${to}-title`} label="Subject" error={err("title")}>
          <Input id={`msg-${to}-title`} name="title" required maxLength={140} defaultValue={keep(state, "title")} aria-invalid={bad(state, "title")} />
        </Field>
        <Field id={`msg-${to}-body`} label="Message" error={err("body")}>
          <Textarea id={`msg-${to}-body`} name="body" required minLength={5} className="min-h-28" defaultValue={keep(state, "body")} aria-invalid={bad(state, "body")} />
        </Field>
        <Field id={`msg-${to}-files`} label="Attachments" optional error={err("attachments")} hint="Up to 5 files, 10 MB each.">
          <FileInput id={`msg-${to}-files`} name="attachments" multiple invalid={!!err("attachments")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}

/** The committee's creator records money given to the committee from what the chapters sent for its project. */
export function DisbursementForm({ committeeId, held }: { committeeId: string; held: number }) {
  const [state, action, pending] = useActionState(recordDisbursementAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const today = watToday();
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="committeeId" value={committeeId} />
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4 sm:grid-cols-3">
        <Field id="cd-amount" label="Amount given (XAF)" error={err("amount")} hint={`You hold ${formatMoney(held)} for this project.`}>
          <MoneyInput key={`d-${state.nonce ?? 0}`} id="cd-amount" name="amount" required defaultValue={keep(state, "amount")} aria-invalid={bad(state, "amount")} />
        </Field>
        <Field id="cd-date" label="Date given" error={err("paidOn")}>
          <Input id="cd-date" name="paidOn" type="date" max={today} required defaultValue={keep(state, "paidOn", today)} aria-invalid={bad(state, "paidOn")} />
        </Field>
        <Field id="cd-note" label="Note" optional error={err("note")}>
          <Input id="cd-note" name="note" maxLength={200} placeholder="e.g. First instalment" defaultValue={keep(state, "note")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending || held <= 0}>
          {pending ? "Saving…" : "Record money given"}
        </Button>
      </div>
    </form>
  );
}

/* ── Meetings, minutes and documents ───────────────────────────────── */

/** The committee's President or Secretary schedules a meeting. */
export function ScheduleCommitteeMeetingForm({ committeeId }: { committeeId: string }) {
  const [state, action, pending] = useActionState(scheduleCommitteeMeetingAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="committeeId" value={committeeId} />
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4 sm:grid-cols-2">
        <Field id="cmt-title" label="Title" error={err("title")}>
          <Input id="cmt-title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Planning meeting" defaultValue={keep(state, "title")} aria-invalid={bad(state, "title")} />
        </Field>
        <Field id="cmt-starts" label="Date and time (WAT)" error={err("startsAt")}>
          <Input id="cmt-starts" name="startsAt" type="datetime-local" required defaultValue={keep(state, "startsAt")} aria-invalid={bad(state, "startsAt")} />
        </Field>
        <Field id="cmt-location" label="Location" error={err("location")} className="sm:col-span-2">
          <Input id="cmt-location" name="location" required minLength={2} maxLength={200} placeholder="e.g. Chapter hall, or a video call" defaultValue={keep(state, "location")} aria-invalid={bad(state, "location")} />
        </Field>
        <Field id="cmt-agenda" label="Agenda" optional error={err("agenda")} hint="One item per line." className="sm:col-span-2">
          <Textarea id="cmt-agenda" name="agenda" maxLength={2000} className="min-h-24" defaultValue={keep(state, "agenda")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule meeting"}
        </Button>
      </div>
    </form>
  );
}

/** Mark a scheduled committee meeting held or cancelled. */
export function CommitteeMeetingStatusForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(setCommitteeMeetingStatusAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="held" variant="secondary" size="sm" disabled={pending}>
          Mark as held
        </Button>
        <Button type="submit" name="status" value="cancelled" variant="ghost" size="sm" className="border border-line-strong" disabled={pending}>
          Mark as cancelled
        </Button>
      </div>
    </form>
  );
}

/** The committee's Secretary writes the minutes, saving a draft or publishing them. */
export function CommitteeMinutesForm({ meetingId, text, decisions }: { meetingId: string; text?: string; decisions?: string[] }) {
  const [state, action, pending] = useActionState(saveCommitteeMinutesAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <Field id="cmn-text" label="Minutes" error={err("text")}>
        <Textarea id="cmn-text" name="text" required minLength={10} maxLength={20000} className="min-h-48" defaultValue={keep(state, "text", text ?? "")} aria-invalid={bad(state, "text")} />
      </Field>
      <Field id="cmn-decisions" label="Decisions" optional error={err("decisions")} hint="One decision per line.">
        <Textarea id="cmn-decisions" name="decisions" maxLength={4000} className="min-h-24" defaultValue={keep(state, "decisions", (decisions ?? []).join("\n"))} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-ink-500 sm:mr-auto">Published minutes are final.</p>
        <Button type="submit" variant="ghost" className="border border-line-strong" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button type="submit" name="publish" value="on" variant="primary" disabled={pending}>
          Publish minutes
        </Button>
      </div>
    </form>
  );
}

/** The committee's President, Secretary or Financial Secretary shares a document. */
export function CommitteeDocumentForm({ committeeId, meetings, meetingId }: { committeeId: string; meetings?: Array<{ id: string; title: string }>; meetingId?: string }) {
  const [state, action, pending] = useActionState(uploadCommitteeDocumentAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="committeeId" value={committeeId} />
      {meetingId && <input type="hidden" name="meetingId" value={meetingId} />}
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4 sm:grid-cols-2">
        <Field id="cmd-title" label="Title" error={err("title")}>
          <Input id="cmd-title" name="title" required minLength={3} maxLength={160} defaultValue={keep(state, "title")} aria-invalid={bad(state, "title")} />
        </Field>
        {!meetingId && meetings && meetings.length > 0 && (
          <Field id="cmd-meeting" label="For a meeting" optional error={err("meetingId")}>
            <Select id="cmd-meeting" name="meetingId" defaultValue={keep(state, "meetingId")}>
              <option value="">Not for a particular meeting</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id="cmd-file" label="File" error={err("file")} hint="Up to 10 MB." className="sm:col-span-2">
          <FileInput id="cmd-file" name="file" required invalid={!!err("file")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Uploading…" : "Share document"}
        </Button>
      </div>
    </form>
  );
}
