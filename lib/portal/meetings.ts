import "server-only";
import { z } from "zod";
import type { ID, Meeting, MeetingAudience, MeetingReminder, Member, NotificationRecord, Scope } from "@/lib/domain/types";
import { currentChapterId, db, newId, scheduleSave } from "@/lib/demo/store";
import { exactScopesWhere, type Actor } from "@/lib/permissions/engine";
import { roleName } from "@/lib/permissions/roles";
import { recordAudit } from "./audit";
import { storeDocument, type CommandResult } from "./commands";
import { checkFile, type IncomingFile } from "./files";
import { holdsPostWithin, runsMeeting, scopeLabel } from "./visibility";

/*
 * Chapter, regional and national meetings, scheduled by whoever holds
 * CREATE_MEETING exactly at that scope: the Chapter Secretary (their chapter),
 * the Regional Coordinator (their region) and the National Secretary General
 * (national). Who a meeting is for depends on its level:
 *  - chapter: all its members, or its executives;
 *  - region: all its members, or selected executives;
 *  - national: all members, or a chosen mix of executives, whole regions and
 *    whole chapters (every member of a chosen region or chapter is called).
 * Officers with EDIT_MEETING change, cancel or mark it held; the Secretary
 * writes the minutes (the Vice Secretary may draft) and publishes them.
 */

const DENIED = "You are not authorized to do this. The request was refused and nothing was changed.";
const fail = (error: string, fieldErrors?: Record<string, string>): CommandResult => ({ ok: false, error, fieldErrors });
const fieldErrorsFrom = (err: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.map(String).join(".")] ??= i.message;
  return out;
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
/** Times are entered in West Africa Time (UTC+1). */
const wat = (local: string) => new Date(`${local.slice(0, 16)}:00+01:00`).toISOString();

const scopeValue = (s: Scope) => (s.level === "organization" ? "organization" : s.level === "region" ? `region:${s.regionId}` : `chapter:${s.chapterId}`);
function parseScope(value: string): Scope | null {
  const d = db();
  if (value === "organization") return { level: "organization" };
  const [level, id] = value.split(":");
  if (level === "region" && d.regions.some((r) => r.id === id)) return { level: "region", regionId: id };
  if (level === "chapter" && d.chapters.some((c) => c.id === id)) return { level: "chapter", chapterId: id };
  return null;
}
const auditScope = (s: Scope) => ({
  chapterId: s.level === "chapter" ? s.chapterId : null,
  regionId: s.level === "region" ? s.regionId : s.level === "organization" ? null : undefined,
});

export const AUDIENCE_LABEL: Record<MeetingAudience, string> = {
  all: "All members",
  executives: "Executives only",
  selected: "Selected",
};
/** The "who is it for" choices at each level. */
export const AUDIENCES_AT: Record<Scope["level"], MeetingAudience[]> = {
  chapter: ["all", "executives"],
  region: ["all", "selected"],
  organization: ["all", "selected"],
};

/** Members of a scope: the chapter's, the region's chapters', or everyone's. */
function membersOf(scope: Scope): Member[] {
  const d = db();
  return d.members.filter((m) => {
    if (m.status !== "active") return false;
    if (scope.level === "organization") return true;
    const chapterId = currentChapterId(m.id);
    if (!chapterId) return false;
    if (scope.level === "chapter") return chapterId === scope.chapterId;
    return d.chapters.find((c) => c.id === chapterId)?.regionId === scope.regionId;
  });
}

/** The people a meeting is for. */
export function meetingInvitees(meeting: Meeting): Member[] {
  const audience = meeting.audience ?? "all";
  const d = db();
  if (audience === "selected") {
    const people = new Set(meeting.inviteeIds ?? []);
    const chapters = new Set(meeting.inviteeChapterIds ?? []);
    const regions = new Set(meeting.inviteeRegionIds ?? []);
    return d.members.filter((m) => {
      if (m.status !== "active") return false;
      if (people.has(m.id)) return true;
      const chapterId = currentChapterId(m.id);
      if (!chapterId) return false;
      if (chapters.has(chapterId)) return true;
      const regionId = d.chapters.find((c) => c.id === chapterId)?.regionId;
      return !!regionId && regions.has(regionId);
    });
  }
  const all = membersOf(meeting.scope);
  return audience === "executives" ? all.filter((m) => holdsPostWithin(m.id, meeting.scope)) : all;
}

/** The executives of a scope, with their post — for choosing who a "selected" meeting is for. */
function executivesOf(scope: Scope) {
  const d = db();
  return d.members
    .filter((m) => m.status === "active" && holdsPostWithin(m.id, scope))
    .map((m) => {
      const post = d.assignments.find((a) => a.memberId === m.id && a.status === "active");
      const chapterId = currentChapterId(m.id);
      const regionId = d.chapters.find((c) => c.id === chapterId)?.regionId ?? null;
      return { id: m.id, label: `${m.fullName} — ${post ? roleName(post.roleKey) : "Executive"}`, chapterId, regionId };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Where the actor may schedule meetings, with the executives they could invite at each. */
export function schedulingOptions(actor: Actor) {
  const scopes = exactScopesWhere(actor, "CREATE_MEETING");
  if (scopes.length === 0 || actor.inactive) return null;
  const d = db();
  return scopes.map((s) => ({
    value: scopeValue(s),
    level: s.level,
    label: s.level === "organization" ? "National (whole organisation)" : `${scopeLabel(s)}${s.level === "region" ? " (regional)" : ""}`,
    audiences: AUDIENCES_AT[s.level],
    executives: s.level === "chapter" ? [] : executivesOf(s),
    // National meetings can call whole regions and chapters.
    regions: s.level === "organization" ? d.regions.map((r) => ({ id: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)) : [],
    chapters: s.level === "organization" ? d.chapters.map((c) => ({ id: c.id, label: c.name, regionId: c.regionId ?? null })).sort((a, b) => a.label.localeCompare(b.label)) : [],
  }));
}

/** Tells the people a meeting is for (except the actor). */
function notifyInvitees(from: Actor | ID, meeting: Meeting, type: NotificationRecord["type"], title: string, body: string) {
  const fromId = typeof from === "string" ? from : from.member.id;
  const now = new Date().toISOString();
  const link = `/dashboard/meetings/${meeting.id}`;
  if ((meeting.audience ?? "all") === "all") {
    db().notifications.push({ id: newId("nt"), type, title, body, audience: { kind: "scope", scope: meeting.scope }, link, createdBy: fromId, createdAt: now });
    return;
  }
  for (const m of meetingInvitees(meeting)) {
    if (m.id === fromId && typeof from !== "string") continue; // not to yourself (reminders go to everyone)
    db().notifications.push({ id: newId("nt"), type, title, body, audience: { kind: "member", memberId: m.id }, link, createdBy: fromId, createdAt: now });
  }
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WAT";

const details = {
  title: z.string().trim().min(3, "Give the meeting a title.").max(160),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter the date and time."),
  endsAt: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "Enter the end time.")]).optional().default(""),
  location: z.string().trim().min(2, "Enter where it takes place.").max(200),
  agenda: z.string().trim().max(3000).optional().default(""),
};
const endOf = (startsAt: string, endsAt: string) => (endsAt ? wat(`${startsAt.slice(0, 10)}T${endsAt}`) : undefined);

export const scheduleSchema = z.object({
  scope: z.string().min(1, "Choose where the meeting is for."),
  ...details,
  audience: z.enum(["all", "executives", "selected"], { message: "Choose who the meeting is for." }),
  inviteeIds: z.array(z.string()).optional().default([]),
  inviteeRegionIds: z.array(z.string()).optional().default([]),
  inviteeChapterIds: z.array(z.string()).optional().default([]),
});

/** Schedules a meeting; the people it is for are told. */
export function scheduleMeeting(actor: Actor, raw: unknown): CommandResult {
  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const scope = parseScope(input.scope);
  const options = schedulingOptions(actor);
  const option = options?.find((o) => o.value === input.scope);
  if (!scope || !option) return fail(DENIED);
  const startsAt = wat(input.startsAt);
  if (startsAt < new Date().toISOString()) return fail("Choose a date and time in the future.", { startsAt: "In the past." });
  const endsAt = endOf(input.startsAt, input.endsAt);
  if (endsAt && endsAt <= startsAt) return fail("The meeting must end after it starts.", { endsAt: "Before the start." });
  if (!option.audiences.includes(input.audience)) return fail("That choice is not available for this meeting.", { audience: "Not available here." });
  let inviteeIds: string[] | undefined;
  let inviteeRegionIds: string[] | undefined;
  let inviteeChapterIds: string[] | undefined;
  if (input.audience === "selected") {
    const pick = (chosen: string[], allowed: Array<{ id: string }>) => {
      const ok = new Set(allowed.map((x) => x.id));
      return [...new Set(chosen)].filter((id) => ok.has(id));
    };
    inviteeIds = pick(input.inviteeIds, option.executives);
    inviteeRegionIds = pick(input.inviteeRegionIds, option.regions);
    inviteeChapterIds = pick(input.inviteeChapterIds, option.chapters);
    if (inviteeIds.length + inviteeRegionIds.length + inviteeChapterIds.length === 0) {
      return fail(scope.level === "organization" ? "Choose the executives, regions or chapters this meeting is for." : "Choose the executives this meeting is for.", { inviteeIds: "Choose at least one." });
    }
  }
  const meeting: Meeting = {
    id: newId("mt"),
    title: input.title,
    startsAt,
    endsAt,
    location: input.location,
    scope,
    status: "scheduled",
    agenda: lines(input.agenda),
    createdBy: actor.member.id,
    audience: input.audience,
    inviteeIds,
    inviteeRegionIds: inviteeRegionIds?.length ? inviteeRegionIds : undefined,
    inviteeChapterIds: inviteeChapterIds?.length ? inviteeChapterIds : undefined,
  };
  meeting.remindersSent = remindersDue(meeting, new Date());
  db().meetings.push(meeting);
  recordAudit(actor, {
    action: "CREATE",
    entityType: "meeting",
    entityId: meeting.id,
    ...auditScope(scope),
    summary: `Scheduled “${meeting.title}” (${scopeLabel(scope)}, ${AUDIENCE_LABEL[input.audience].toLowerCase()}) for ${when(startsAt)}`,
    newValues: { title: meeting.title, startsAt, location: meeting.location, audience: input.audience, invitees: inviteeIds?.length ?? null },
  });
  notifyInvitees(actor, meeting, "meeting_reminder", `Meeting: ${meeting.title}`, `${when(startsAt)} · ${meeting.location}`);
  return { ok: true, message: `“${meeting.title}” is scheduled for ${when(startsAt)}. Everyone it is for has been told.` };
}

const editable = (actor: Actor, meetingId: string) => {
  const meeting = db().meetings.find((m) => m.id === meetingId);
  if (!meeting) return { error: fail("Meeting not found.") } as const;
  if (!runsMeeting(actor, "CREATE_MEETING", meeting)) return { error: fail(DENIED) } as const;
  if (meeting.status !== "scheduled") return { error: fail(`This meeting is already ${meeting.status}.`) } as const;
  return { meeting } as const;
};

/** Changes a scheduled meeting's details; the people it is for are told. */
export function updateMeeting(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ meetingId: z.string().min(1), ...details }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const found = editable(actor, parsed.data.meetingId);
  if (found.error) return found.error;
  const m = found.meeting!;
  if (m.startsAt <= new Date().toISOString()) return fail("This meeting has started and can no longer be changed.");
  const input = parsed.data;
  const startsAt = wat(input.startsAt);
  const endsAt = endOf(input.startsAt, input.endsAt);
  if (endsAt && endsAt <= startsAt) return fail("The meeting must end after it starts.", { endsAt: "Before the start." });
  const before = { title: m.title, startsAt: m.startsAt, location: m.location, agenda: m.agenda };
  Object.assign(m, { title: input.title, startsAt, endsAt, location: input.location, agenda: lines(input.agenda) });
  if (startsAt !== before.startsAt) m.remindersSent = remindersDue(m, new Date()); // a new time: reminders start over
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "meeting",
    entityId: m.id,
    ...auditScope(m.scope),
    summary: `Changed “${m.title}”`,
    oldValues: before,
    newValues: { title: m.title, startsAt: m.startsAt, location: m.location, agenda: m.agenda },
  });
  notifyInvitees(actor, m, "meeting_reminder", `Changed: ${m.title}`, `Now ${when(startsAt)} · ${m.location}`);
  return { ok: true, message: "The meeting was updated and everyone it is for has been told." };
}

/** Cancels a scheduled meeting, with a reason; the people it is for are told. */
export function cancelMeeting(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ meetingId: z.string().min(1), reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300) }).safeParse(raw);
  if (!parsed.success) return fail("A reason is required to cancel a meeting.", fieldErrorsFrom(parsed.error));
  const found = editable(actor, parsed.data.meetingId);
  if (found.error) return found.error;
  const m = found.meeting!;
  const notHeld = m.startsAt <= new Date().toISOString();
  m.status = "cancelled";
  m.cancelReason = parsed.data.reason;
  if (notHeld) m.notHeld = true;
  const label = notHeld ? "Not held" : "Cancelled";
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "meeting",
    entityId: m.id,
    ...auditScope(m.scope),
    summary: `${notHeld ? "Marked not held" : "Cancelled"}: “${m.title}”`,
    oldValues: { status: "scheduled" },
    newValues: { status: "cancelled", notHeld },
    reason: parsed.data.reason,
  });
  notifyInvitees(actor, m, "announcement", `${label}: ${m.title}`, parsed.data.reason);
  return { ok: true, message: `“${m.title}”: ${label.toLowerCase()}.` };
}

/** Marks a meeting as held, once it has started. */
export function markMeetingHeld(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ meetingId: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return fail("Meeting not found.");
  const found = editable(actor, parsed.data.meetingId);
  if (found.error) return found.error;
  const m = found.meeting!;
  if (m.startsAt > new Date().toISOString()) return fail("A meeting can be marked held once it has started.");
  m.status = "held";
  recordAudit(actor, { action: "UPDATE", entityType: "meeting", entityId: m.id, ...auditScope(m.scope), summary: `Marked “${m.title}” held`, oldValues: { status: "scheduled" }, newValues: { status: "held" } });
  return { ok: true, message: `“${m.title}” is marked held. Record attendance and minutes below.` };
}

/** Writes the minutes: the Secretary (or Vice Secretary) saves a draft; the Secretary publishes. Published minutes are final. */
export function saveMeetingMinutes(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({
      meetingId: z.string().min(1),
      discussion: z.string().trim().min(10, "Write the minutes (at least a sentence or two).").max(20000),
      keyIssues: z.string().trim().max(4000).optional().default(""),
      resolutions: z.string().trim().max(4000).optional().default(""),
      publish: z.string().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const d = db();
  const m = d.meetings.find((x) => x.id === parsed.data.meetingId);
  if (!m) return fail("Meeting not found.");
  const publish = parsed.data.publish === "on";
  const mayDraft = runsMeeting(actor, "CREATE_MINUTES", m) || runsMeeting(actor, "EDIT_MINUTES", m);
  if (actor.inactive || !mayDraft) return fail("Minutes are written by the Secretary.");
  if (publish && !runsMeeting(actor, "EDIT_MINUTES", m)) return fail("Minutes are published by the Secretary.");
  if (m.status === "cancelled") return fail("This meeting was cancelled.");
  if (m.startsAt > new Date().toISOString()) return fail("Minutes can be written once the meeting has started.");
  const existing = d.minutes.find((x) => x.meetingId === m.id);
  if (existing?.status === "published") return fail("These minutes are published and can no longer be changed.");
  const now = new Date().toISOString();
  const values = {
    discussion: parsed.data.discussion,
    keyIssues: lines(parsed.data.keyIssues),
    resolutions: lines(parsed.data.resolutions),
    status: publish ? ("published" as const) : ("draft" as const),
    recordedBy: actor.member.id,
    updatedAt: now,
    publishedAt: publish ? now : undefined,
  };
  if (existing) Object.assign(existing, values);
  else d.minutes.push({ id: newId("mn"), meetingId: m.id, ...values });
  recordAudit(actor, {
    action: publish ? "APPROVE" : existing ? "UPDATE" : "CREATE",
    entityType: "meeting_minutes",
    entityId: m.id,
    ...auditScope(m.scope),
    summary: `${publish ? "Published" : "Saved draft"} minutes of “${m.title}”`,
  });
  if (publish) notifyInvitees(actor, m, "minutes_published", `Minutes published: ${m.title}`, "The minutes are now available on the meeting page.");
  return { ok: true, message: publish ? "The minutes are published and everyone the meeting was for has been told." : "Draft saved. Only the Secretaries and the meeting's officers can see it until it is published." };
}

/** Records a decision of a meeting, optionally with an action: what is to be done, by whom, by when. */
export function addDecision(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({
      meetingId: z.string().min(1),
      text: z.string().trim().min(5, "Write the decision.").max(1000),
      actionTitle: z.string().trim().max(300).optional().default(""),
      assigneeId: z.string().optional().default(""),
      dueDate: z.union([z.literal(""), z.iso.date("Enter a valid due date.")]).optional().default(""),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();
  const m = d.meetings.find((x) => x.id === input.meetingId);
  if (!m) return fail("Meeting not found.");
  if (!runsMeeting(actor, "CREATE_DECISION", m)) return fail(DENIED);
  if (m.status === "cancelled") return fail("This meeting was cancelled.");
  const withAction = !!(input.actionTitle || input.assigneeId || input.dueDate);
  if (withAction) {
    if (!runsMeeting(actor, "CREATE_ACTION_ITEM", m)) return fail(DENIED);
    const errors: Record<string, string> = {};
    if (input.actionTitle.length < 3) errors.actionTitle = "Say what is to be done.";
    if (!input.assigneeId) errors.assigneeId = "Choose who is responsible.";
    if (!input.dueDate) errors.dueDate = "Choose a due date.";
    if (Object.keys(errors).length) return fail("Complete the action, or leave all three action fields empty.", errors);
    if (!meetingInvitees(m).some((x) => x.id === input.assigneeId) && input.assigneeId !== m.createdBy) return fail("Choose someone the meeting is for.", { assigneeId: "Not invited." });
  }
  const now = new Date().toISOString();
  const decisionId = newId("dc");
  d.decisions.push({ id: decisionId, meetingId: m.id, text: input.text, recordedBy: actor.member.id, createdAt: now });
  if (withAction) {
    const actionId = newId("ai");
    d.actionItems.push({ id: actionId, decisionId, meetingId: m.id, title: input.actionTitle, assigneeId: input.assigneeId, dueDate: `${input.dueDate}T17:00:00Z`, status: "pending" });
    if (input.assigneeId !== actor.member.id) {
      d.notifications.push({
        id: newId("nt"),
        type: "action_assigned",
        title: `Action for you: ${input.actionTitle}`,
        body: `From “${m.title}”. Due ${input.dueDate}.`,
        audience: { kind: "member", memberId: input.assigneeId },
        link: `/dashboard/meetings/${m.id}`,
        createdBy: actor.member.id,
        createdAt: now,
      });
    }
  }
  recordAudit(actor, {
    action: "CREATE",
    entityType: "decision",
    entityId: decisionId,
    ...auditScope(m.scope),
    summary: `Recorded a decision of “${m.title}”${withAction ? " with an action" : ""}`,
  });
  return { ok: true, message: withAction ? "Decision and action recorded; the person responsible has been told." : "Decision recorded." };
}

/**
 * Adds a document to a meeting (agenda papers, reports, signed minutes): the
 * Secretaries, the Regional Coordinator for regional meetings and the National
 * Secretary General (CREATE_MINUTES). Only those the meeting is for see it.
 */
export function uploadMeetingDocument(actor: Actor, raw: unknown, file: IncomingFile | undefined): CommandResult {
  const parsed = z.object({ meetingId: z.string().min(1), title: z.string().trim().min(3, "Give the document a title.").max(160) }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const m = db().meetings.find((x) => x.id === parsed.data.meetingId);
  if (!m) return fail("Meeting not found.");
  if (!runsMeeting(actor, "CREATE_MINUTES", m)) return fail(DENIED);
  if (m.status === "cancelled") return fail("This meeting was cancelled.");
  if (!file) return fail("Choose a file to upload.", { file: "Choose a file." });
  const problem = checkFile(file);
  if (problem) return fail(problem, { file: problem });
  const id = storeDocument(actor, file, { title: parsed.data.title, category: "minutes", scope: m.scope, roleKeys: [], attachment: false });
  db().documents.find((x) => x.id === id)!.meetingId = m.id;
  notifyInvitees(actor, m, "document_uploaded", `New document for ${m.title}`, parsed.data.title);
  return { ok: true, message: `“${parsed.data.title}” was added to the meeting. Everyone it is for has been told.` };
}

/* ── Reminders ─────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;
const MORNING_HOUR_WAT = 7;
/** The date in West Africa Time (UTC+1), e.g. "2026-11-07". */
const watDay = (t: number) => new Date(t + 3600_000).toISOString().slice(0, 10);

/**
 * The reminders whose time has come for a meeting: "day" from 24 hours before
 * it starts, "morning" from 07:00 WAT on its day. Nothing once it has started.
 */
export function remindersDue(meeting: Meeting, now: Date): MeetingReminder[] {
  const start = new Date(meeting.startsAt).getTime();
  const t = now.getTime();
  if (t >= start) return [];
  const due: MeetingReminder[] = [];
  if (start - t <= DAY_MS) due.push("day");
  if (watDay(t) === watDay(start) && new Date(t + 3600_000).getUTCHours() >= MORNING_HOUR_WAT) due.push("morning");
  return due;
}

const timeWat = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }) + " WAT";

/**
 * Sends the automatic meeting reminders that are due — the day before and on
 * the morning of each scheduled meeting — to everyone it is for, each once.
 * When both are due together (a meeting the same morning), only the morning
 * one is sent. Testing mode runs this as pages load; on Supabase, a scheduled
 * job runs send_meeting_reminders() every 15 minutes.
 */
export function sendDueReminders(now = new Date()): number {
  let sent = 0;
  for (const m of db().meetings) {
    if (m.status !== "scheduled") continue;
    const already = new Set(m.remindersSent ?? []);
    const due = remindersDue(m, now).filter((r) => !already.has(r));
    if (due.length === 0) continue;
    if (due.includes("morning")) {
      notifyInvitees(m.createdBy, m, "meeting_reminder", `Today: ${m.title}`, `Starts at ${timeWat(m.startsAt)} · ${m.location}`);
    } else {
      const tomorrow = watDay(new Date(m.startsAt).getTime()) !== watDay(now.getTime());
      notifyInvitees(m.createdBy, m, "meeting_reminder", `${tomorrow ? "Tomorrow" : "Today"}: ${m.title}`, `${when(m.startsAt)} · ${m.location}`);
    }
    m.remindersSent = [...already, ...due];
    sent++;
  }
  if (sent) scheduleSave();
  return sent;
}
