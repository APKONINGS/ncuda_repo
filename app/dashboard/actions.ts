"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor, requireActor } from "@/lib/auth/actor";
import { clearSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/portal/audit";
import * as commands from "@/lib/portal/commands";
import * as committees from "@/lib/portal/committees";
import * as meetings from "@/lib/portal/meetings";
import { saveDb } from "@/lib/demo/store";
import { readFiles } from "@/lib/portal/files";
import { listNotifications } from "@/lib/portal/queries";

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** After a refused submission: what was typed, minus the fields that were wrong (so only those are cleared). */
  values?: Record<string, string>;
  nonce?: number;
};

const toState = (r: commands.CommandResult, fd?: FormData): FormState => {
  if (r.ok) return { ok: true, message: r.message, nonce: Date.now() };
  const values: Record<string, string> = {};
  if (fd) {
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" || k.startsWith("$") || r.fieldErrors?.[k]) continue;
      values[k] = values[k] ? `${values[k]}
${v}` : v;
    }
  }
  return { ok: false, error: r.error, fieldErrors: r.fieldErrors, values, nonce: Date.now() };
};

/** After any change: save the demo data (if a store file is configured) and refresh the portal. */
function changed() {
  saveDb();
  revalidatePath("/dashboard", "layout");
}

const formObject = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function signOut() {
  const actor = await getActor();
  if (actor) {
    recordAudit(actor, { action: "LOGOUT", entityType: "session", entityId: actor.member.id, chapterId: actor.chapterId, summary: `${actor.member.fullName} signed out` });
  }
  await clearSession();
  redirect("/member-portal?signed-out=1");
}

export async function recordContributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.recordContribution(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function voidContributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.voidContribution(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function assignRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.assignRole(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function endRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.endRole(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function createMemberAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.createMember(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function recordAttendanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const meetingId = String(fd.get("meetingId") ?? "");
  const entries: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("status:")) entries[k.slice(7)] = String(v);
  const result = commands.recordAttendance(actor, meetingId, entries);
  if (result.ok) changed();
  return toState(result, fd);
}

/* Meetings: schedule, change, cancel, mark held, minutes, decisions. */
const meetingAction =
  (run: (actor: Awaited<ReturnType<typeof requireActor>>, input: Record<string, unknown>) => commands.CommandResult) =>
  async (_prev: FormState, fd: FormData): Promise<FormState> => {
    const actor = await requireActor();
    const result = run(actor, {
      ...formObject(fd),
      inviteeIds: fd.getAll("inviteeIds").map(String),
      inviteeRegionIds: fd.getAll("inviteeRegionIds").map(String),
      inviteeChapterIds: fd.getAll("inviteeChapterIds").map(String),
    });
    if (result.ok) changed();
    return toState(result, fd);
  };
export const scheduleMeetingAction = meetingAction(meetings.scheduleMeeting);
export const updateMeetingAction = meetingAction(meetings.updateMeeting);
export const cancelMeetingAction = meetingAction(meetings.cancelMeeting);
export const markMeetingHeldAction = meetingAction(meetings.markMeetingHeld);
export const saveMeetingMinutesAction = meetingAction(meetings.saveMeetingMinutes);
export const addDecisionAction = meetingAction(meetings.addDecision);

export async function uploadMeetingDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const [file] = await readFiles(fd.getAll("file"));
  const result = meetings.uploadMeetingDocument(actor, { meetingId: String(fd.get("meetingId") ?? ""), title: String(fd.get("title") ?? "") }, file);
  if (result.ok) changed();
  return toState(result, fd);
}

export async function completeActionItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.completeActionItem(actor, String(fd.get("id") ?? ""));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function markAllNotificationsReadAction() {
  const actor = await requireActor();
  commands.markNotificationsRead(actor, listNotifications(actor).map((n) => n.id));
  changed();
}

/** Marks one notification as read (called when the reader closes it). */
export async function markNotificationReadAction(id: string) {
  const actor = await requireActor();
  commands.markNotificationsRead(actor, [id]);
  changed();
}

export async function sendMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const files = await readFiles(fd.getAll("attachments"));
  const result = commands.sendMessage(
    actor,
    {
      scope: String(fd.get("scope") ?? ""),
      roleKeys: fd.getAll("roleKeys").map(String),
      title: String(fd.get("title") ?? ""),
      body: String(fd.get("body") ?? ""),
    },
    files,
  );
  if (result.ok) changed();
  return toState(result, fd);
}

/** Reads an appointee picker ("<prefix>.mode", ".memberId", ".fullName", ".email", ".phone"). */
function appointee(fd: FormData, prefix: string) {
  const get = (k: string) => String(fd.get(`${prefix}.${k}`) ?? "");
  return { mode: get("mode") || "new", memberId: get("memberId"), fullName: get("fullName"), email: get("email"), phone: get("phone"), password: get("password") };
}

export async function createRegionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.createRegion(actor, { name: String(fd.get("name") ?? ""), coordinator: appointee(fd, "coordinator") });
  if (result.ok) changed();
  return toState(result, fd);
}

export async function appointCoordinatorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.appointRegionCoordinator(actor, { regionId: String(fd.get("regionId") ?? ""), coordinator: appointee(fd, "coordinator") });
  if (result.ok) changed();
  return toState(result, fd);
}

export async function updateRegionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.updateRegion(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function updateChapterAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.updateChapter(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function transferMemberAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.transferMember(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function createChapterAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  // Fields named "exco.<ROLE>.<field>" become { exco: { ROLE: { field } } }.
  const exco: Record<string, Record<string, string>> = {};
  for (const [key, value] of fd.entries()) {
    const m = /^exco\.([A-Z_]+)\.(fullName|email|phone|password)$/.exec(key);
    if (m) (exco[m[1]] ??= {})[m[2]] = String(value);
  }
  const result = commands.createChapter(actor, {
    name: String(fd.get("name") ?? ""),
    location: String(fd.get("location") ?? ""),
    regionId: String(fd.get("regionId") ?? ""),
    president: appointee(fd, "president"),
    financialSecretary: appointee(fd, "financialSecretary"),
    exco,
  });
  if (result.ok) changed();
  return toState(result, fd);
}

export async function forwardMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.forwardMessage(actor, {
    notificationId: String(fd.get("notificationId") ?? ""),
    scope: String(fd.get("scope") ?? ""),
    roleKeys: fd.getAll("roleKeys").map(String),
    note: String(fd.get("note") ?? ""),
  });
  if (result.ok) changed();
  return toState(result, fd);
}

export async function uploadDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const [file] = await readFiles(fd.getAll("file"));
  const result = commands.uploadDocument(
    actor,
    {
      title: String(fd.get("title") ?? ""),
      category: String(fd.get("category") ?? ""),
      scope: String(fd.get("scope") ?? ""),
      roleKeys: fd.getAll("roleKeys").map(String),
    },
    file,
  );
  if (result.ok) changed();
  return toState(result, fd);
}

export async function setMemberStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.setMemberStatus(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function createCollectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.createCollection(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function recordExpenseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  // "Send project money" goes to the creator of the project's committees; anything else is an ordinary expense.
  const input = formObject(fd);
  const result = input.kind === "send" ? committees.sendProjectMoney(actor, input) : commands.recordExpense(actor, input);
  if (result.ok) changed();
  return toState(result, fd);
}

export async function voidExpenseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = commands.voidExpense(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function setChapterFeeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.setChapterRegistrationFee(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function startRenewalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.startRegistrationRenewal(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function cancelRenewalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.cancelRegistrationRenewal(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.updateProfile(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor({ allowInactive: true });
  const result = commands.changePassword(actor, formObject(fd));
  if (result.ok) changed();
  return toState(result, fd);
}

/* ── Committees ─────────────────────────────────────────────────────── */

const committeeAction =
  (run: (actor: Awaited<ReturnType<typeof requireActor>>, input: Record<string, unknown>) => commands.CommandResult) =>
  async (_prev: FormState, fd: FormData): Promise<FormState> => {
    const actor = await requireActor();
    const result = run(actor, formObject(fd));
    if (result.ok) changed();
    return toState(result, fd);
  };

export const createCommitteeAction = committeeAction(committees.createCommittee);
export const addCommitteeMemberAction = committeeAction(committees.addCommitteeMember);
export const setCommitteePositionAction = committeeAction(committees.setCommitteePosition);
export const removeCommitteeMemberAction = committeeAction(committees.removeCommitteeMember);
export const dissolveCommitteeAction = committeeAction(committees.dissolveCommittee);
export const recordDisbursementAction = committeeAction(committees.recordDisbursement);
export const voidCommitteeRecordAction = committeeAction(committees.voidCommitteeRecord);

export const scheduleCommitteeMeetingAction = committeeAction(committees.scheduleCommitteeMeeting);
export const setCommitteeMeetingStatusAction = committeeAction(committees.setCommitteeMeetingStatus);
export const saveCommitteeMinutesAction = committeeAction(committees.saveCommitteeMinutes);

export async function recordCommitteeAttendanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const entries: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("status:")) entries[k.slice(7)] = String(v);
  const result = committees.recordCommitteeAttendance(actor, String(fd.get("meetingId") ?? ""), entries);
  if (result.ok) changed();
  return toState(result, fd);
}

export async function uploadCommitteeDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const [file] = await readFiles(fd.getAll("file"));
  const result = committees.uploadCommitteeDocument(
    actor,
    { committeeId: String(fd.get("committeeId") ?? ""), title: String(fd.get("title") ?? ""), meetingId: String(fd.get("meetingId") ?? "") },
    file,
  );
  if (result.ok) changed();
  return toState(result, fd);
}

export async function sendCommitteeMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireActor();
  const files = await readFiles(fd.getAll("attachments"));
  const result = committees.sendCommitteeMessage(
    actor,
    { committeeId: String(fd.get("committeeId") ?? ""), to: String(fd.get("to") ?? ""), title: String(fd.get("title") ?? ""), body: String(fd.get("body") ?? "") },
    files,
  );
  if (result.ok) changed();
  return toState(result, fd);
}
