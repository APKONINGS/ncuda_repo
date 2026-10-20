"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  assignRoleAction,
  completeActionItemAction,
  createMemberAction,
  setChapterFeeAction,
  endRoleAction,
  recordAttendanceAction,
  recordCommitteeAttendanceAction,
  voidCommitteeRecordAction,
  voidContributionAction,
  voidExpenseAction,
  type FormState,
} from "@/app/dashboard/actions";
import {
  Field,
  Input,
  Select,
  Textarea,
  inputClasses,
} from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { Button } from "@/components/ui/Button";
import { cn, formatMoney } from "@/lib/utils";

/* ── Shared ─────────────────────────────────────────────────────────── */

export function FormMessage({ state }: { state: FormState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.nonce) return;
    // Draw attention to the first field that needs fixing; otherwise to the message.
    const firstWrong = !state.ok ? ref.current?.closest("form")?.querySelector<HTMLElement>('[aria-invalid="true"]') : null;
    const target = firstWrong ?? ref.current;
    target?.focus();
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state.nonce, state.ok]);
  if (!state.message && !state.error) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-[var(--radius-sm)] border px-4 py-3 text-sm leading-relaxed outline-none",
        state.ok
          ? "border-forest-600/30 bg-forest-100 text-forest-900"
          : "border-danger/30 bg-earth-100/70 text-ink-900",
      )}
    >
      {state.ok ? state.message : state.error}
    </div>
  );
}

const err = (s: FormState, k: string) => s.fieldErrors?.[k];
/** What was typed into `k` before a refused submission (wrong fields come back empty). */
const kept = (s: FormState, k: string, fallback = "") => s.values?.[k] ?? fallback;

const aria = (s: FormState, k: string) => ({
  id: k,
  name: k,
  "aria-invalid": err(s, k) ? true : undefined,
  "aria-describedby": err(s, k) ? `${k}-error` : undefined,
});

/* ── Contributions ──────────────────────────────────────────────────── */

/** Cancels a payment, an expense (kind="expense") or a committee money record (kind="committee"), with a reason. */
export function VoidContributionButton({
  id,
  label,
  kind = "contribution",
  paymentKind,
}: {
  id: string;
  label: string;
  /** For a payment: what it is, for the button's wording. */
  paymentKind?: "registration" | "contribution" | "fine";
  /** "committee": a payment or expense in a committee's books. */
  kind?: "contribution" | "expense" | "committee";
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    kind === "expense" ? voidExpenseAction : kind === "committee" ? voidCommitteeRecordAction : voidContributionAction,
    {},
  );
  const cancelLabel =
    kind === "expense"
      ? "Cancel expense"
      : kind === "committee"
        ? "Cancel"
        : paymentKind === "registration"
          ? "Cancel registration"
          : paymentKind === "fine"
            ? "Cancel fine"
            : paymentKind === "contribution"
              ? "Cancel contribution"
              : "Cancel payment";
  if (state.ok) return <span className="text-xs text-ink-500">Cancelled</span>;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-100"
      >
        {cancelLabel}<span className="sr-only"> {label}</span>
      </button>
      {open && (
        <form
          action={action}
          className="absolute right-0 top-full z-20 mt-2 grid w-72 gap-3 rounded-[var(--radius-md)] border border-line bg-paper p-4 text-left shadow-[var(--shadow-lift)]"
        >
          <input type="hidden" name="id" value={id} />
          <FormMessage state={state} />
          <label
            htmlFor={`reason-${id}`}
            className="text-sm font-medium text-ink-900"
          >
            Reason
          </label>
          <Textarea
            id={`reason-${id}`}
            name="reason"
            required
            minLength={5}
            className="min-h-20"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Keep
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Saving…" : cancelLabel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ── Meetings ───────────────────────────────────────────────────────── */

const STATUSES = ["present", "late", "excused", "absent"] as const;

export function AttendanceForm({
  meetingId,
  roll,
  committee = false,
}: {
  meetingId: string;
  roll: Array<{ id: string; fullName: string; status?: string }>;
  /** A committee meeting (the committee's officers record it). */
  committee?: boolean;
}) {
  const [state, action, pending] = useActionState(committee ? recordCommitteeAttendanceAction : recordAttendanceAction, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <ul className="divide-y divide-line">
        {roll.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 py-3">
            <span
              id={`att-${m.id}`}
              className="text-sm font-medium text-ink-900"
            >
              {m.fullName}
            </span>
            <fieldset
              aria-labelledby={`att-${m.id}`}
              className="flex flex-wrap gap-1"
            >
              {STATUSES.map((s) => (
                <label key={s} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`status:${m.id}`}
                    value={s}
                    defaultChecked={m.status === s}
                    className="peer sr-only"
                  />
                  <span className="inline-block rounded-full border border-line px-2.5 py-1.5 text-xs capitalize text-ink-700 transition-colors peer-checked:border-forest-800 peer-checked:bg-forest-800 peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth-600 hover:border-ink-300">
                    {s}
                  </span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save attendance"}
        </Button>
      </div>
    </form>
  );
}

export function CompleteActionButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(completeActionItemAction, {});
  if (state.ok)
    return (
      <span className="text-xs font-medium text-forest-700">Completed ✓</span>
    );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state.error && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="border border-line-strong"
        disabled={pending}
      >
        {pending ? "Saving…" : "Mark complete"}
      </Button>
    </form>
  );
}

/* ── Roles ──────────────────────────────────────────────────────────── */

export function AssignRoleForm({
  members,
  roles,
  regions,
  holders,
}: {
  /** `currentPost`: the one post they hold now (and whether you may end it). */
  members: Array<{
    id: string;
    fullName: string;
    chapterName: string;
    chapterId: string | null;
    regionId: string | null;
    currentPost?: { assignmentId: string; label: string; canEnd: boolean };
  }>;
  roles: Array<{ key: string; name: string; scopeLevel: string }>;
  /** Regions where a regional role may be assigned. */
  regions: Array<{ id: string; name: string }>;
  /** Every post held now. */
  holders: Array<{ roleKey: string; scopeKey: string; assignmentId: string; name: string; canEnd: boolean }>;
}) {
  const [state, action, pending] = useActionState(assignRoleAction, {});
  // The selection is cleared by each successful appointment (a choice made
  // before that save is older than its nonce), so the next one starts fresh.
  const [pick, setPick] = useState({ id: "", at: 0 });
  const memberId = state.ok && state.nonce && pick.at < state.nonce ? "" : pick.id;
  const chosen = members.find((m) => m.id === memberId);
  const [roleKey, setRoleKey] = useState("");
  const [regionId, setRegionId] = useState("");
  const role = roles.find((r) => r.key === roleKey);
  // Where the post would be: the member's chapter, the chosen region, or the organisation.
  const scopeKey = !role ? null : role.scopeLevel === "chapter" ? (chosen?.chapterId ? `chapter:${chosen.chapterId}` : null) : role.scopeLevel === "region" ? (regionId ? `region:${regionId}` : null) : "organization";
  const taken = scopeKey ? holders.find((h) => h.roleKey === roleKey && h.scopeKey === scopeKey) : undefined;
  const takenRegion = (id: string) => holders.find((h) => h.roleKey === roleKey && h.scopeKey === `region:${id}`);
  const blocked = !!chosen?.currentPost || !!taken;
  return (
    <div className="grid gap-5">
      <form action={action} className="grid gap-5">
        <FormMessage state={state} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="memberId" label="Member" error={err(state, "memberId")}>
            <Select
              {...aria(state, "memberId")}
              required
              value={memberId}
              onChange={(e) => setPick({ id: e.target.value, at: Date.now() })}
            >
              <option value="" disabled>
                Choose a member…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} — {m.chapterName}
                  {m.currentPost ? ` · currently ${m.currentPost.label}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="roleKey"
            label="Role"
            error={err(state, "roleKey")}
          >
            <Select {...aria(state, "roleKey")} required value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              <option value="" disabled>
                Choose a role…
              </option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          {role?.scopeLevel === "region" && (
            <Field id="regionId" label="Region" error={err(state, "regionId")}>
              <Select {...aria(state, "regionId")} required value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="" disabled>
                  Choose a region…
                </option>
                {regions.map((r) => {
                  const h = takenRegion(r.id);
                  const notTheirs = !!chosen && chosen.regionId !== r.id;
                  return (
                    <option key={r.id} value={r.id} disabled={!!h || notTheirs}>
                      {r.name}
                      {h ? ` — ${h.name}` : notTheirs ? " — not their region" : ""}
                    </option>
                  );
                })}
              </Select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-500">
            One post per person.
          </p>
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || blocked}
          >
            {pending ? "Assigning…" : "Assign role"}
          </Button>
        </div>
      </form>
      {taken && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-gold-500/60 bg-gold-100/60 p-4 text-sm text-ink-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <span className="font-medium">{taken.name}</span> holds this post. Uplift them first.
          </p>
          {taken.canEnd && <EndRoleButton key={taken.assignmentId} assignmentId={taken.assignmentId} label={`${role?.name} for ${taken.name}`} />}
        </div>
      )}
      {chosen?.currentPost && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-gold-500/60 bg-gold-100/60 p-4 text-sm text-ink-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <span className="font-medium">{chosen.fullName}</span> currently
            holds{" "}
            <span className="font-medium">{chosen.currentPost.label}</span>. Uplift
            that post first.
          </p>
          {chosen.currentPost.canEnd && (
            <EndRoleButton
              key={chosen.currentPost.assignmentId}
              assignmentId={chosen.currentPost.assignmentId}
              label={`${chosen.currentPost.label} for ${chosen.fullName}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function EndRoleButton({
  assignmentId,
  label,
}: {
  assignmentId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(endRoleAction, {});
  if (state.ok) return <span className="text-xs text-ink-500">Uplifted</span>;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium text-earth-700 hover:bg-earth-100"
      >
        Uplift<span className="sr-only"> {label}</span>
      </button>
      {open && (
        <form
          action={action}
          className="absolute right-0 top-full z-20 mt-2 grid w-72 gap-3 rounded-[var(--radius-md)] border border-line bg-paper p-4 text-left shadow-[var(--shadow-lift)]"
        >
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <FormMessage state={state} />
          <label
            htmlFor={`end-${assignmentId}`}
            className="text-sm font-medium text-ink-900"
          >
            Reason
          </label>
          <input
            id={`end-${assignmentId}`}
            name="reason"
            required
            minLength={3}
            className={inputClasses}
            placeholder="e.g. End of term"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Uplift"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ── Members ────────────────────────────────────────────────────────── */

/** The chapter's Financial Secretary sets or changes its registration fee (one amount for everyone). */
export function ChapterFeeForm({ chapterId, chapterName, fee }: { chapterId: string; chapterName: string; fee: number | null }) {
  const [state, action, pending] = useActionState(setChapterFeeAction, {});
  const [editing, setEditing] = useState(fee === null);
  return (
    <div className="grid gap-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700">
          {fee === null ? (
            <>No registration amount is set for {chapterName} yet. Members can only be registered, and registration recorded, once it is.</>
          ) : (
            <>
              Registration fee for {chapterName}: <span className="num font-display text-xl text-forest-900">{formatMoney(fee)}</span>
              <span className="block text-xs text-ink-500">Same for everyone.</span>
            </>
          )}
        </p>
        {fee !== null && (
          <Button type="button" variant="ghost" size="sm" className="border border-line-strong" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Change"}
          </Button>
        )}
      </div>
      {editing && (
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="chapterId" value={chapterId} />
          <Field id={`fee-${chapterId}`} label="Registration amount (XAF)" error={state.fieldErrors?.amount} className="sm:w-64">
            <MoneyInput key={`fee-${state.nonce ?? 0}`} id={`fee-${chapterId}`} name="amount" required defaultValue={state.values?.amount ?? (fee ? String(fee) : "")} aria-invalid={state.fieldErrors?.amount ? true : undefined} />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save amount"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function CreateMemberForm({
  chapters,
}: {
  /** Chapters the officer registers members in, with their registration fee (null until set). */
  chapters: Array<{ id: string; name: string; fee: number | null }>;
}) {
  const [state, action, pending] = useActionState(createMemberAction, {});
  const [chapterId, setChapterId] = useState(kept(state, "chapterId", chapters.length === 1 ? chapters[0].id : ""));
  const chosen = chapters.find((c) => c.id === chapterId);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="fullName" label="Full name" error={err(state, "fullName")}>
          <Input {...aria(state, "fullName")} defaultValue={kept(state, "fullName")} required autoComplete="off" />
        </Field>
        <Field
          id="email"
          label="Email"
          error={err(state, "email")}
          hint="Their sign-in address."
        >
          <Input
            {...aria(state, "email")}
            defaultValue={kept(state, "email")}
            type="email"
            required
            autoComplete="off"
          />
        </Field>
        <Field id="phone" label="Phone" optional error={err(state, "phone")}>
          <PhoneInput {...aria(state, "phone")} defaultValue={kept(state, "phone")} />
        </Field>
        <Field
          id="password"
          label="Temporary password"
          error={err(state, "password")}
          hint="Share it privately."
        >
          <Input
            {...aria(state, "password")}
            defaultValue={kept(state, "password")}
            required
            autoComplete="new-password"
            spellCheck={false}
          />
        </Field>
        <Field
          id="registrationFee"
          label="Registration fee paid (XAF)"
          hint={
            chosen && !chosen.fee
              ? "Set the chapter's registration amount first (above)."
              : "Registration fee."
          }
        >
          <Input id="registrationFee" value={chosen?.fee ? chosen.fee.toLocaleString("en-GB") : ""} placeholder="—" readOnly className="num bg-cream text-ink-700" />
        </Field>
        <Field id="chapterId" label="Chapter" error={err(state, "chapterId")}>
          <Select
            {...aria(state, "chapterId")}
            required
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
          >
            <option value="" disabled>
              Choose a chapter…
            </option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">
          
        </p>
        <Button type="submit" variant="secondary" disabled={pending || (!!chosen && !chosen.fee)}>
          {pending ? "Creating…" : "Create member account"}
        </Button>
      </div>
    </form>
  );
}
