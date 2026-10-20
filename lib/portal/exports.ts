import "server-only";
import { currentChapterId, db, isExecutive } from "@/lib/demo/store";
import { csvFilename, toCsv, type CsvCell } from "@/lib/csv";
import { can, chaptersWhere, type Actor } from "@/lib/permissions/engine";
import { roleName } from "@/lib/permissions/roles";
import { recordAudit } from "./audit";
import { meetingInvitees } from "./meetings";
import {
  attendanceRegister,
  CENTRAL_LEDGER,
  chapterName,
  getMeeting,
  listMembers,
  memberName,
  PAYMENT_KINDS,
  scopedContributions,
  scopedExpenses,
  visibleCollections,
  type FinanceFilters,
  type PaymentKind,
} from "./queries";
import { currentRegistrationPayment, registrationStanding, registrationYear } from "./registration";
import { canIn, scopeLabel } from "./visibility";

/*
 * Spreadsheet downloads (CSV). Each export contains exactly what the person
 * can already see on the page it comes from — built from the same
 * permission-checked queries — and every export is written to the audit log.
 */

export const EXPORT_KINDS = ["members", "payments", "expenses", "registration", "attendance"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export type ExportFile = { filename: string; body: string };

const day = (iso: string | undefined | null) => (iso ? iso.slice(0, 10) : "");
const KIND_LABEL: Record<PaymentKind, string> = { contribution: "Contribution", fine: "Fine", registration: "Registration" };
const ATTENDANCE_LABEL = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" } as const;

/** Builds the export, or null when there is nothing the person may export. */
export function buildExport(actor: Actor, kind: ExportKind, params: URLSearchParams): ExportFile | null {
  // Registration is handled while unpaid (the Financial Secretary's desk); the rest needs an active account.
  if (actor.inactive && kind !== "registration") return null;
  switch (kind) {
    case "members":
      return membersExport(actor);
    case "payments":
      return paymentsExport(actor, params);
    case "expenses":
      return expensesExport(actor);
    case "registration":
      return registrationExport(actor);
    case "attendance":
      return params.get("meeting") ? meetingAttendanceExport(actor, params.get("meeting")!) : attendanceExport(actor);
  }
}

function done(actor: Actor, name: string, headers: string[], rows: CsvCell[][], what: string, chapterId: string | null = null): ExportFile {
  recordAudit(actor, { action: "EXPORT", entityType: "export", entityId: null, chapterId, regionId: chapterId ? undefined : null, summary: `Downloaded ${what} as a spreadsheet (${rows.length} rows)` });
  return { filename: csvFilename(name), body: toCsv(headers, rows) };
}

function membersExport(actor: Actor) {
  const data = listMembers(actor);
  if (!data) return null;
  const rows = data.rows.map((m) => [
    m.fullName,
    m.memberNumber,
    m.chapterId ? m.chapterName : "Not in a chapter yet",
    m.roles.map(roleName).join("; "),
    m.email,
    m.phone ?? "",
    m.status === "active" ? (m.registrationDue ? `Inactive (registration ${m.registrationDue} unpaid)` : "Active") : "Suspended",
    day(m.joinedAt),
  ]);
  const single = data.chapterIds.length === 1 ? data.chapterIds[0] : null;
  return done(actor, single ? `members ${chapterName(single)}` : "members", ["Name", "Member number", "Chapter", "Posts", "Email", "Phone", "Status", "Joined"], rows, "the member list", single);
}

/** The same filters as the Chapter records page, checked the same way. */
function financeFilters(actor: Actor, params: URLSearchParams): FinanceFilters {
  const all = scopedContributions(actor);
  const chapter = params.get("chapter") ?? "";
  const collection = params.get("collection") ?? "";
  const type = params.get("type") ?? "";
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    chapterId: all && (all.chapterIds.includes(chapter) || (all.seesCentral && chapter === CENTRAL_LEDGER)) ? chapter : undefined,
    collectionId: collection === "none" || visibleCollections(actor).some((c) => c.id === collection) ? collection || undefined : undefined,
    type: (PAYMENT_KINDS as string[]).includes(type) ? (type as PaymentKind) : undefined,
    from: date(params.get("from")),
    to: date(params.get("to")),
  };
}

function paymentsExport(actor: Actor, params: URLSearchParams) {
  const filters = financeFilters(actor, params);
  const data = scopedContributions(actor, filters);
  if (!data) return null;
  const rows = data.rows.map((r) => [
    day(r.receivedOn),
    r.reference,
    r.memberName,
    r.ledger === "central" ? "Central (NCUDA)" : r.chapterName,
    KIND_LABEL[r.kind],
    r.collectionName ?? "",
    r.description,
    r.expectedAmount ?? "",
    r.amount,
    r.status === "recorded" ? "Recorded" : "Cancelled",
    r.recordedByName,
    day(r.recordedAt),
  ]);
  const name = filters.chapterId ? `payments ${filters.chapterId === CENTRAL_LEDGER ? "central" : chapterName(filters.chapterId)}` : "payments";
  return done(
    actor,
    name,
    ["Date received", "Receipt", "Member", "Chapter", "Type", "Project", "Description", "Expected (XAF)", "Amount (XAF)", "Status", "Recorded by", "Recorded on"],
    rows,
    "payment records",
    filters.chapterId && filters.chapterId !== CENTRAL_LEDGER ? filters.chapterId : null,
  );
}

function expensesExport(actor: Actor) {
  const data = scopedExpenses(actor);
  const rows = data.groups.flatMap((g) =>
    g.rows.map((e) => [day(e.spentOn), e.reference, e.scopeLabel, e.description, e.paidTo ?? "", e.amount, e.status === "recorded" ? "Recorded" : "Cancelled", e.recordedByName, day(e.recordedAt)]),
  );
  if (rows.length === 0 && data.scopes.length === 0) return null;
  return done(actor, "expenses", ["Date spent", "Voucher", "Whose funds", "Description", "Paid to", "Amount (XAF)", "Status", "Recorded by", "Recorded on"], rows, "expenses");
}

/** Everyone in the chapters whose registration the person handles or follows. */
function registrationExport(actor: Actor) {
  const d = db();
  const national = can(actor, "MANAGE_REGISTRATION", { organization: true }, { chapters: d.chapters });
  const chapterIds = national
    ? d.chapters.map((c) => c.id)
    : [
        ...new Set([
          ...chaptersWhere(actor, "CREATE_MEMBER", { chapters: d.chapters }),
          ...d.chapters.filter((c) => c.regionId && can(actor, "VIEW_CONTRIBUTIONS", { regionId: c.regionId }, { chapters: d.chapters })).map((c) => c.id),
        ]),
      ];
  if (chapterIds.length === 0) return null;
  const year = registrationYear();
  const rows = d.members
    .filter((m) => m.status === "active")
    .map((m) => ({ m, chapterId: currentChapterId(m.id) }))
    .filter((x) => (x.chapterId ? chapterIds.includes(x.chapterId) : national))
    .map(({ m, chapterId }) => {
      const standing = registrationStanding(m.id);
      const payment = currentRegistrationPayment(m.id);
      return [
        m.fullName,
        chapterId ? chapterName(chapterId) : "Not in a chapter yet",
        isExecutive(m.id) ? "Yes" : "No",
        year,
        standing.registered ? "Registered" : "Not registered",
        standing.fee ?? "",
        payment?.amount ?? "",
        payment?.reference ?? "",
        day(payment?.receivedOn),
        payment ? memberName(payment.recordedBy) : "",
      ];
    })
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
  const single = chapterIds.length === 1 ? chapterIds[0] : null;
  return done(
    actor,
    single ? `registration ${year} ${chapterName(single)}` : `registration ${year}`,
    ["Name", "Chapter", "Executive", "Year", "Status", "Fee (XAF)", "Paid (XAF)", "Receipt", "Paid on", "Recorded by"],
    rows,
    `registration ${year}`,
    single,
  );
}

function attendanceExport(actor: Actor) {
  const data = attendanceRegister(actor);
  if (!data) return null;
  const LEVEL = { chapter: "Chapter", region: "Regional", organization: "National" } as const;
  const rows = data.meetings.map((r) => [day(r.meeting.startsAt), r.meeting.title, LEVEL[r.meeting.scope.level], r.where, r.invited, r.recorded, r.recorded ? r.present : ""]);
  return done(actor, "attendance register", ["Date", "Meeting", "Level", "Where", "Invited", "Recorded", "Present or late"], rows, "the attendance register");
}

/** One meeting's attendance, person by person — for those who take or review it. */
function meetingAttendanceExport(actor: Actor, meetingId: string) {
  const data = getMeeting(actor, meetingId);
  if (!data) return null;
  const { meeting } = data;
  if (!canIn(actor, "RECORD_ATTENDANCE", meeting.scope) && !canIn(actor, "VIEW_MEMBER", meeting.scope)) return null;
  const recorded = new Map(db().attendance.filter((a) => a.meetingId === meeting.id).map((a) => [a.memberId, a]));
  const rows = meetingInvitees(meeting)
    .map((m) => {
      const a = recorded.get(m.id);
      return [m.fullName, chapterName(currentChapterId(m.id)), a ? ATTENDANCE_LABEL[a.status] : "Not recorded"];
    })
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
  return done(
    actor,
    `attendance ${meeting.title} ${day(meeting.startsAt)}`,
    ["Name", "Chapter", "Attendance"],
    rows,
    `attendance for “${meeting.title}” (${scopeLabel(meeting.scope)})`,
    meeting.scope.level === "chapter" ? meeting.scope.chapterId : null,
  );
}
