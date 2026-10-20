"use client";

import { useActionState, useState } from "react";
import {
  addDecisionAction,
  cancelMeetingAction,
  markMeetingHeldAction,
  saveMeetingMinutesAction,
  scheduleMeetingAction,
  updateMeetingAction,
  uploadMeetingDocumentAction,
  type FormState,
} from "@/app/dashboard/actions";
import { Field, FileInput, Input, Select, Textarea } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

type Pick = { id: string; label: string; chapterId?: string | null; regionId?: string | null };
type ScopeOption = {
  value: string;
  level: "organization" | "region" | "chapter";
  label: string;
  audiences: Array<"all" | "executives" | "selected">;
  executives: Pick[];
  regions: Pick[];
  chapters: Pick[];
};
const keep = (s: FormState, k: string, fallback = "") => s.values?.[k] ?? fallback;
const bad = (s: FormState, k: string) => (s.fieldErrors?.[k] ? true : undefined);

const AUDIENCES = {
  all: { label: "All members", hint: { chapter: "Every member of the chapter.", region: "Every member of the region's chapters.", organization: "Every member of NCUDA." } },
  executives: { label: "Executives only", hint: { chapter: "Everyone holding a post in the chapter.", region: "", organization: "" } },
  selected: { label: "Chosen people", hint: { chapter: "", region: "Choose the executives to call.", organization: "Choose executives, whole regions and whole chapters." } },
} as const;

/** A list of checkboxes (people, regions or chapters) for a "chosen people" meeting. */
function Checklist({
  title,
  name,
  items,
  picked,
  locked,
  onToggle,
}: {
  title: string;
  name: string;
  items: Pick[];
  picked: Set<string>;
  /** Already covered by a chosen region or chapter: shown ticked and locked. */
  locked: (p: Pick) => boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-ink-500">{title}</p>
      <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        {items.map((e) => {
          const isLocked = locked(e);
          return (
            <label key={e.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${isLocked ? "opacity-60" : "cursor-pointer hover:bg-cream"}`}>
              <input
                type="checkbox"
                name={isLocked ? undefined : name}
                value={e.id}
                checked={isLocked || picked.has(e.id)}
                disabled={isLocked}
                onChange={(ev) => onToggle(e.id, ev.target.checked)}
                className="accent-forest-800"
              />
              <span className="text-ink-900">{e.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Executives, whole regions and whole chapters: a chosen region locks its chapters and executives; a chosen chapter, its executives. */
function InviteePicker({ option }: { option: ScopeOption }) {
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [chapters, setChapters] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, update: (s: Set<string>) => void) => (id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    update(next);
  };
  const chapterCovered = (c: Pick) => !!c.regionId && regions.has(c.regionId);
  const personCovered = (p: Pick) => (!!p.regionId && regions.has(p.regionId)) || (!!p.chapterId && chapters.has(p.chapterId));
  return (
    <>
      <Checklist title="Executives" name="inviteeIds" items={option.executives} picked={people} locked={personCovered} onToggle={toggle(people, setPeople)} />
      <Checklist title="Whole regions (all their members)" name="inviteeRegionIds" items={option.regions} picked={regions} locked={() => false} onToggle={toggle(regions, setRegions)} />
      <Checklist title="Whole chapters (all their members)" name="inviteeChapterIds" items={option.chapters} picked={chapters} locked={chapterCovered} onToggle={toggle(chapters, setChapters)} />
    </>
  );
}

/** The date, time, place and agenda of a meeting (shared by scheduling and editing). */
function DetailFields({ state, prefix, initial }: { state: FormState; prefix: string; initial?: { title: string; startsAt: string; endsAt: string; location: string; agenda: string } }) {
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${prefix}-title`} label="Title" error={err("title")} className="sm:col-span-2">
        <Input id={`${prefix}-title`} name="title" required minLength={3} maxLength={160} placeholder="e.g. Monthly general meeting" defaultValue={keep(state, "title", initial?.title)} aria-invalid={bad(state, "title")} />
      </Field>
      <Field id={`${prefix}-starts`} label="Date and start time (WAT)" error={err("startsAt")}>
        <Input id={`${prefix}-starts`} name="startsAt" type="datetime-local" required defaultValue={keep(state, "startsAt", initial?.startsAt)} aria-invalid={bad(state, "startsAt")} />
      </Field>
      <Field id={`${prefix}-ends`} label="End time" optional error={err("endsAt")}>
        <Input id={`${prefix}-ends`} name="endsAt" type="time" defaultValue={keep(state, "endsAt", initial?.endsAt)} aria-invalid={bad(state, "endsAt")} />
      </Field>
      <Field id={`${prefix}-location`} label="Location" error={err("location")} className="sm:col-span-2">
        <Input id={`${prefix}-location`} name="location" required minLength={2} maxLength={200} placeholder="e.g. Chapter hall, or a video call link" defaultValue={keep(state, "location", initial?.location)} aria-invalid={bad(state, "location")} />
      </Field>
      <Field id={`${prefix}-agenda`} label="Agenda" optional hint="One item per line." className="sm:col-span-2">
        <Textarea id={`${prefix}-agenda`} name="agenda" maxLength={3000} className="min-h-28" defaultValue={keep(state, "agenda", initial?.agenda)} />
      </Field>
    </div>
  );
}

/** Schedule a chapter, regional or national meeting, for all members, executives, or selected executives. */
export function ScheduleMeetingForm({ options }: { options: ScopeOption[] }) {
  const [state, action, pending] = useActionState(scheduleMeetingAction, {});
  const [scope, setScope] = useState(keep(state, "scope", options[0]?.value ?? ""));
  const [audience, setAudience] = useState(keep(state, "audience", "all"));
  const option = options.find((o) => o.value === scope) ?? options[0];
  const chosen = option.audiences.includes(audience as "all") ? audience : "all";
  return (
    <form action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-5">
        {options.length > 1 && (
          <Field id="mt-scope" label="Meeting of" error={state.fieldErrors?.scope}>
            <Select
              id="mt-scope"
              name="scope"
              required
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setAudience("all");
              }}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {options.length === 1 && <input type="hidden" name="scope" value={scope} />}
        <DetailFields state={state} prefix="mt" />
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium text-ink-900">Who is it for?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {option.audiences.map((value) => (
              <label key={value} className="flex cursor-pointer gap-3 rounded-[var(--radius-md)] border border-line bg-paper p-3 has-[:checked]:border-forest-700 has-[:checked]:bg-forest-100/60">
                <input type="radio" name="audience" value={value} checked={chosen === value} onChange={() => setAudience(value)} className="mt-1 accent-forest-800" />
                <span className="text-sm">
                  <span className="block font-medium text-ink-900">{AUDIENCES[value].label}</span>
                  <span className="text-xs text-ink-500">{AUDIENCES[value].hint[option.level]}</span>
                </span>
              </label>
            ))}
          </div>
          {chosen === "selected" && (
            <div className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-paper p-3">
              {state.fieldErrors?.inviteeIds && <p className="text-xs font-medium text-danger">{state.fieldErrors.inviteeIds}</p>}
              <InviteePicker key={option.value} option={option} />
            </div>
          )}
        </fieldset>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule meeting"}
        </Button>
      </div>
    </form>
  );
}

/** Change a scheduled meeting's details. */
export function EditMeetingForm({ meetingId, initial }: { meetingId: string; initial: { title: string; startsAt: string; endsAt: string; location: string; agenda: string } }) {
  const [state, action, pending] = useActionState(updateMeetingAction, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <DetailFields state={state} prefix="edit" initial={initial} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** Cancel a scheduled meeting (a reason is required). */
export function CancelMeetingForm({ meetingId, notHeld = false }: { meetingId: string; notHeld?: boolean }) {
  const [state, action, pending] = useActionState(cancelMeetingAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <Field id="cancel-reason" label="Reason" error={state.fieldErrors?.reason}>
        <Textarea id="cancel-reason" name="reason" required minLength={5} className="min-h-20" defaultValue={keep(state, "reason")} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Saving…" : notHeld ? "Mark not held" : "Cancel meeting"}
        </Button>
      </div>
    </form>
  );
}

/** Mark a meeting as held (once it has started). */
export function MarkHeldButton({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(markMeetingHeldAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Mark as held"}
      </Button>
    </form>
  );
}

/** The Secretary writes the minutes: save a draft, or publish (final). */
export function MinutesForm({ meetingId, canPublish, initial }: { meetingId: string; canPublish: boolean; initial?: { discussion: string; keyIssues: string[]; resolutions: string[] } | null }) {
  const [state, action, pending] = useActionState(saveMeetingMinutesAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <Field id="mn-discussion" label="Minutes" error={err("discussion")}>
        <Textarea id="mn-discussion" name="discussion" required minLength={10} maxLength={20000} className="min-h-48" defaultValue={keep(state, "discussion", initial?.discussion ?? "")} aria-invalid={bad(state, "discussion")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mn-issues" label="Key issues" optional hint="One per line.">
          <Textarea id="mn-issues" name="keyIssues" maxLength={4000} className="min-h-24" defaultValue={keep(state, "keyIssues", (initial?.keyIssues ?? []).join("\n"))} />
        </Field>
        <Field id="mn-resolutions" label="Resolutions" optional hint="One per line.">
          <Textarea id="mn-resolutions" name="resolutions" maxLength={4000} className="min-h-24" defaultValue={keep(state, "resolutions", (initial?.resolutions ?? []).join("\n"))} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-ink-500 sm:mr-auto">
          {canPublish ? "Published minutes are final." : "The Secretary publishes the minutes."}
        </p>
        <Button type="submit" variant="ghost" className="border border-line-strong" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        {canPublish && (
          <Button type="submit" name="publish" value="on" variant="primary" disabled={pending}>
            Publish minutes
          </Button>
        )}
      </div>
    </form>
  );
}

/** Record a decision, optionally with an action: what, who, by when. */
export function DecisionForm({ meetingId, canAssign, assignees }: { meetingId: string; canAssign: boolean; assignees: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(addDecisionAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-4">
        <Field id="dc-text" label="Decision" error={err("text")}>
          <Textarea id="dc-text" name="text" required minLength={5} maxLength={1000} className="min-h-20" placeholder="e.g. The chapter will hold a fundraising dinner in December." defaultValue={keep(state, "text")} aria-invalid={bad(state, "text")} />
        </Field>
        {canAssign && (
          <fieldset className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-paper p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium text-ink-900">Action (optional)</legend>
            <Field id="dc-action" label="What is to be done" error={err("actionTitle")}>
              <Input id="dc-action" name="actionTitle" maxLength={300} defaultValue={keep(state, "actionTitle")} aria-invalid={bad(state, "actionTitle")} />
            </Field>
            <Field id="dc-assignee" label="Responsible" error={err("assigneeId")}>
              <Select id="dc-assignee" name="assigneeId" defaultValue={keep(state, "assigneeId")} aria-invalid={bad(state, "assigneeId")}>
                <option value="">Choose…</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dc-due" label="Due date" error={err("dueDate")}>
              <Input id="dc-due" name="dueDate" type="date" defaultValue={keep(state, "dueDate")} aria-invalid={bad(state, "dueDate")} />
            </Field>
          </fieldset>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Record decision"}
        </Button>
      </div>
    </form>
  );
}

/** Add a document to a meeting (agenda papers, reports, signed minutes). */
export function MeetingDocumentForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(uploadMeetingDocumentAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <FormMessage state={state} />
      <div key={state.ok ? state.nonce : "draft"} className="grid gap-3">
        <Field id="md-title" label="Title" error={err("title")}>
          <Input id="md-title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Treasurer's report" defaultValue={keep(state, "title")} aria-invalid={bad(state, "title")} />
        </Field>
        <Field id="md-file" label="File" error={err("file")} hint="Up to 10 MB.">
          <FileInput id="md-file" name="file" required invalid={!!err("file")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Uploading…" : "Add document"}
        </Button>
      </div>
    </form>
  );
}
