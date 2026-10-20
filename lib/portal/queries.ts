import "server-only";
import type { AttendanceStatus, AuditEntry, Collection, Contribution, Expense, ID, Member, NotificationRecord, Scope } from "@/lib/domain/types";
import { currentChapterId, db, isExecutive } from "@/lib/demo/store";
import { chapterFee, currentRegistrationPayment, currentRenewal, registrationStanding, registrationYear } from "./registration";
import { AUDIENCE_LABEL, meetingInvitees } from "./meetings";
import { can, canAtExactly, canChangeMemberStatus, canCreateChapter, canEndRole, canWriteLedger, chaptersWhere, exactScopesWhere, hasAnywhere, ledgerChaptersWhere, scopeCovers, type Actor, type Target } from "@/lib/permissions/engine";
import type { Permission } from "@/lib/permissions/catalog";
import { ROLES, roleName, rolePlural } from "@/lib/permissions/roles";
import { watDate, watToday } from "@/lib/utils";
import {
  canAnyIn,
  canIn,
  inMembershipLine,
  documentDownloadable,
  documentVisible,
  meetingVisible,
  runsMeeting,
  notificationVisible,
  org,
  scopeLabel,
} from "./visibility";

/*
 * Read-side portal queries. Each takes the actor and returns ONLY what that
 * actor may see. Pages never touch the store directly.
 */

const byDateDesc = <T>(get: (x: T) => string) => (a: T, b: T) => get(b).localeCompare(get(a));
/** Alphabetical, with numbers in natural order ("SW Chapter 2" before "SW Chapter 10"). */
const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
const byDateAsc = <T>(get: (x: T) => string) => (a: T, b: T) => get(a).localeCompare(get(b));

export function memberName(id: ID | null | undefined) {
  if (!id) return "System";
  return db().members.find((m) => m.id === id)?.fullName ?? "Unknown member";
}

export function chapterName(id: ID | null | undefined) {
  if (!id) return "Not in a chapter yet";
  return db().chapters.find((c) => c.id === id)?.name ?? "—";
}

export function chapterRegionId(id: ID) {
  return db().chapters.find((c) => c.id === id)?.regionId ?? null;
}

export function regionName(id: ID | null | undefined) {
  return id ? (db().regions.find((r) => r.id === id)?.name ?? "—") : null;
}

/* ── Meetings ───────────────────────────────────────────────────────── */

export function listMeetings(actor: Actor) {
  const now = new Date().toISOString();
  const d = db();
  const visible = d.meetings
    .filter((m) => meetingVisible(actor, m))
    .map((m) => {
      const row = d.minutes.find((x) => x.meetingId === m.id);
      const draftVisible = runsMeeting(actor, "CREATE_MINUTES", m) || runsMeeting(actor, "EDIT_MINUTES", m);
      const minutesStatus = !row ? "none" : row.status === "published" ? "published" : draftVisible ? "draft" : "none";
      return { ...m, minutesStatus: minutesStatus as "none" | "draft" | "published" };
    });
  return {
    upcoming: visible.filter((m) => m.status === "scheduled" && m.startsAt >= now).sort(byDateAsc((m) => m.startsAt)),
    past: visible.filter((m) => m.status !== "scheduled" || m.startsAt < now).sort(byDateDesc((m) => m.startsAt)),
    canCreate: hasAnywhere(actor, "CREATE_MEETING"),
  };
}

export function getMeeting(actor: Actor, id: ID) {
  const d = db();
  const meeting = d.meetings.find((m) => m.id === id);
  if (!meeting || !meetingVisible(actor, meeting)) return null;

  const canRecordAttendance = runsMeeting(actor, "RECORD_ATTENDANCE", meeting);
  const seeFullAttendance = canRecordAttendance || canIn(actor, "VIEW_MEMBER", meeting.scope);
  const attendance = d.attendance
    .filter((a) => a.meetingId === id)
    .filter((a) => seeFullAttendance || a.memberId === actor.member.id)
    .map((a) => ({ ...a, memberName: memberName(a.memberId) }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName));

  const canSeeDraft = runsMeeting(actor, "CREATE_MINUTES", meeting) || runsMeeting(actor, "EDIT_MINUTES", meeting);
  const minutesRow = d.minutes.find((m) => m.meetingId === id);
  const minutes = minutesRow && (minutesRow.status === "published" || canSeeDraft) ? minutesRow : null;

  const decisions = d.decisions
    .filter((x) => x.meetingId === id)
    .map((dec) => ({
      ...dec,
      actions: d.actionItems
        .filter((a) => a.decisionId === dec.id)
        .map((a) => ({
          ...a,
          assigneeName: memberName(a.assigneeId),
          canComplete:
            a.status !== "completed" && runsMeeting(actor, "COMPLETE_ACTION_ITEM", meeting),
        })),
    }));

  const documents = d.documents
    .filter((doc) => doc.meetingId === id && documentVisible(actor, doc))
    .map((doc) => ({ ...doc, canDownload: documentDownloadable(actor, doc) }));

  // The roll: the people the meeting is for.
  const invitees = meetingInvitees(meeting).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const roll = canRecordAttendance && meeting.status !== "cancelled" ? invitees.filter((m) => currentChapterId(m.id)) : [];
  const started = meeting.startsAt <= new Date().toISOString();

  // Outstanding items from earlier meetings of the same scope — surfaced at the next meeting.
  const outstanding =
    meeting.status === "scheduled"
      ? d.actionItems
          .filter((a) => a.status !== "completed")
          .filter((a) => {
            const src = d.meetings.find((m) => m.id === a.meetingId);
            return src && JSON.stringify(src.scope) === JSON.stringify(meeting.scope) && src.startsAt < meeting.startsAt;
          })
          .map((a) => ({ ...a, assigneeName: memberName(a.assigneeId) }))
      : [];

  return {
    meeting,
    scopeLabel: scopeLabel(meeting.scope),
    audienceLabel: AUDIENCE_LABEL[meeting.audience ?? "all"],
    inviteeCount: invitees.length,
    selectedNames:
      meeting.audience === "selected"
        ? [
            ...(meeting.inviteeIds ?? []).map((id) => memberName(id)),
            ...(meeting.inviteeRegionIds ?? []).map((id) => `all of ${regionName(id) ?? "a region"}`),
            ...(meeting.inviteeChapterIds ?? []).map((id) => `all of ${chapterName(id)}`),
          ]
        : null,
    createdByName: memberName(meeting.createdBy),
    canEdit: meeting.status === "scheduled" && runsMeeting(actor, "CREATE_MEETING", meeting),
    canMarkHeld: meeting.status === "scheduled" && started && runsMeeting(actor, "CREATE_MEETING", meeting),
    canWriteMinutes:
      meeting.status !== "cancelled" && started && minutesRow?.status !== "published" && (runsMeeting(actor, "CREATE_MINUTES", meeting) || runsMeeting(actor, "EDIT_MINUTES", meeting)),
    canPublishMinutes: runsMeeting(actor, "EDIT_MINUTES", meeting),
    draftMinutes: minutesRow && minutesRow.status === "draft" && canSeeDraft ? minutesRow : null,
    canDecide: meeting.status !== "cancelled" && runsMeeting(actor, "CREATE_DECISION", meeting),
    canAddDocument: meeting.status !== "cancelled" && runsMeeting(actor, "CREATE_MINUTES", meeting),
    canAssign: runsMeeting(actor, "CREATE_ACTION_ITEM", meeting),
    assignees: invitees.map((m) => ({ id: m.id, name: m.fullName })),
    attendance,
    seeFullAttendance,
    canRecordAttendance,
    roll,
    minutes,
    decisions,
    documents,
    outstanding,
  };
}

/* ── Attendance ─────────────────────────────────────────────────────── */

export function myAttendance(actor: Actor) {
  const d = db();
  const rows = d.attendance
    .filter((a) => a.memberId === actor.member.id)
    .map((a) => ({ ...a, meeting: d.meetings.find((m) => m.id === a.meetingId)! }))
    .sort(byDateDesc((a) => a.meeting.startsAt));
  const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, excused: 0, absent: 0 };
  rows.forEach((r) => counts[r.status]++);
  const rate = rows.length ? Math.round(((counts.present + counts.late) / rows.length) * 100) : null;
  return { rows, counts, rate };
}

/**
 * The attendance register: past meetings (chapter, regional and national) whose
 * attendance the actor takes (Secretaries, Regional Coordinators, the National
 * Secretary General) or may review (officers who see the members there).
 */
export function attendanceRegister(actor: Actor) {
  if (!hasAnywhere(actor, "RECORD_ATTENDANCE") && !hasAnywhere(actor, "VIEW_MEMBER")) return null;
  const d = db();
  const now = new Date().toISOString();
  const meetings = d.meetings
    .filter((m) => m.status !== "cancelled" && m.startsAt < now && meetingVisible(actor, m))
    .filter((m) => canIn(actor, "RECORD_ATTENDANCE", m.scope) || canIn(actor, "VIEW_MEMBER", m.scope))
    .sort(byDateDesc((m) => m.startsAt))
    .map((m) => {
      const rows = d.attendance.filter((a) => a.meetingId === m.id);
      return {
        meeting: m,
        where: scopeLabel(m.scope),
        invited: meetingInvitees(m).length,
        recorded: rows.length,
        present: rows.filter((r) => r.status === "present" || r.status === "late").length,
        canRecord: runsMeeting(actor, "RECORD_ATTENDANCE", m),
      };
    });
  return { meetings };
}

/* ── Contributions ──────────────────────────────────────────────────── */

/** What a payment is: a project contribution, a fine, or a registration fee (its own category). */
export type PaymentKind = "contribution" | "fine" | "registration";
export const PAYMENT_KINDS: PaymentKind[] = ["contribution", "fine", "registration"];
export const kindOf = (c: Contribution): PaymentKind => (c.registrationFee ? "registration" : c.type);

export type ContributionRow = Contribution & {
  kind: PaymentKind;
  memberName: string;
  chapterName: string;
  recordedByName: string;
  collectionName: string | null;
  /** What was still owed right after this payment (negative: paid more than expected); null if not applicable. */
  owedAfter: number | null;
};

/** Payments in the order they were received (then recorded). */
const paymentOrder = (c: Contribution) => `${c.receivedOn}|${c.recordedAt}|${c.id}`;

/**
 * The running position after a payment: for a contribution, the project's
 * expected amount minus everything the member had paid towards it up to and
 * including this payment; for a fine (or a payment towards one), the fine
 * imposed minus what had been paid on it by then. Voided records don't count.
 */
export function owedAfter(c: Contribution): number | null {
  if (c.status !== "recorded" || !c.memberId) return null;
  const d = db();
  const upTo = (x: Contribution) => x.status === "recorded" && paymentOrder(x) <= paymentOrder(c);
  if (c.type === "contribution" && c.collectionId) {
    const col = d.collections.find((x) => x.id === c.collectionId);
    if (!col) return null;
    const paid = d.contributions
      .filter((x) => x.memberId === c.memberId && x.type === "contribution" && x.collectionId === c.collectionId && upTo(x))
      .reduce((s, x) => s + x.amount, 0);
    return expectedFor(col, c.memberId) - paid;
  }
  if (c.type === "fine") {
    const fine = c.settlesFineId ? d.contributions.find((x) => x.id === c.settlesFineId) : c;
    if (!fine || fine.status !== "recorded") return null;
    const later = d.contributions.filter((x) => x.settlesFineId === fine.id && upTo(x)).reduce((s, x) => s + x.amount, 0);
    return (fine.expectedAmount ?? fine.amount) - fine.amount - later;
  }
  return null;
}

const enrich = (c: Contribution): ContributionRow => ({
  ...c,
  kind: kindOf(c),
  owedAfter: owedAfter(c),
  memberName: memberName(c.memberId),
  chapterName: chapterName(c.chapterId),
  recordedByName: memberName(c.recordedBy),
  collectionName: c.collectionId ? (db().collections.find((x) => x.id === c.collectionId)?.name ?? null) : null,
});

const today = () => watToday();

/** What `memberId` is expected to pay towards `collection` (executives and ordinary members differ). */
export function expectedFor(collection: Collection, memberId: ID) {
  return isExecutive(memberId) ? collection.expected.executive : collection.expected.member;
}

/** Recorded amounts a member has paid towards each project, across both ledgers. */
function paidByCollection(memberId: ID) {
  const out: Record<string, number> = {};
  for (const c of db().contributions) {
    if (c.memberId === memberId && c.type === "contribution" && c.collectionId && c.status === "recorded") {
      out[c.collectionId] = (out[c.collectionId] ?? 0) + c.amount;
    }
  }
  return out;
}

/**
 * Fines and what is still owed on each. A fine is the record that imposed
 * it; later payments towards it point back with `settlesFineId`.
 */
/** What a member still owes in fines (all chapters and the centre). */
export function finesOwedBy(memberId: ID) {
  return fineBalances((f) => f.memberId === memberId).reduce((s, f) => s + f.balance, 0);
}

function fineBalances(keep: (fine: Contribution) => boolean) {
  const d = db();
  return d.contributions
    .filter((c) => c.type === "fine" && !c.settlesFineId && c.status === "recorded" && keep(c))
    .map((fine) => {
      const later = d.contributions.filter((c) => c.settlesFineId === fine.id && c.status === "recorded").reduce((s, c) => s + c.amount, 0);
      const imposed = fine.expectedAmount ?? fine.amount;
      const paid = fine.amount + later;
      return { fine, imposed, paid, balance: Math.max(0, imposed - paid) };
    });
}

/** Projects a member of `chapterId` is expected to contribute to (already started). */
function obligationsFor(memberId: ID, chapterId: ID | null) {
  if (!chapterId) return [];
  const paid = paidByCollection(memberId);
  return collectionsForChapter(chapterId)
    .filter((col) => col.startsOn.slice(0, 10) <= today())
    .map((col) => {
      const expected = expectedFor(col, memberId);
      const got = paid[col.id] ?? 0;
      return { collectionId: col.id, name: col.name, expected, paid: got, balance: Math.max(0, expected - got), endsOn: col.endsOn };
    })
    .filter((o) => o.expected > 0 || o.paid > 0);
}

export function myContributions(actor: Actor) {
  const rows = db().contributions.filter((c) => c.memberId === actor.member.id).sort(byDateDesc((c) => c.receivedOn)).map(enrich);
  const total = rows.filter((r) => r.status === "recorded").reduce((s, r) => s + r.amount, 0);
  const projects = obligationsFor(actor.member.id, actor.chapterId);
  const fines = fineBalances((f) => f.memberId === actor.member.id)
    .filter((f) => f.balance > 0)
    .map((f) => ({ id: f.fine.id, description: f.fine.description, imposed: f.imposed, paid: f.paid, balance: f.balance, on: f.fine.receivedOn }));
  const owed = projects.reduce((s, p) => s + p.balance, 0) + fines.reduce((s, f) => s + f.balance, 0);
  return { rows, total, projects, fines, owed, executive: isExecutive(actor.member.id) };
}

/** Group key used for the central ledger in grouped views and filters. */
export const CENTRAL_LEDGER = "central";

export type FinanceFilters = {
  /** A chapter id, or "central" for the central ledger. */
  chapterId?: string;
  /** A collection id, or "none" for payments not tied to any project. */
  collectionId?: string;
  type?: PaymentKind;
  /** Inclusive YYYY-MM-DD bounds on the date received. */
  from?: string;
  to?: string;
};

/**
 * Contribution records in the actor's VIEW_CONTRIBUTIONS scope, optionally
 * filtered, and grouped by chapter with subtotals.
 */
export function scopedContributions(actor: Actor, filters: FinanceFilters = {}) {
  const o = org();
  const chapterIds = chaptersWhere(actor, "VIEW_CONTRIBUTIONS", o);
  const seesCentral = can(actor, "VIEW_CONTRIBUTIONS", { organization: true }, o);
  if (chapterIds.length === 0 && !seesCentral) return null;
  const d = db();

  // Central records belong to the central ledger only — never to a chapter's view.
  // Committee books are shown only on the committee's own page.
  const inScope = (c: Contribution) => (c.ledger === "committee" ? false : c.ledger === "central" ? seesCentral : chapterIds.includes(c.chapterId));
  const matchesChapter = (c: Contribution) =>
    !filters.chapterId || (filters.chapterId === CENTRAL_LEDGER ? c.ledger === "central" : c.ledger === "chapter" && c.chapterId === filters.chapterId);

  const rows = d.contributions
    .filter(inScope)
    .filter(matchesChapter)
    .filter((c) => !filters.collectionId || (filters.collectionId === "none" ? !c.collectionId : c.collectionId === filters.collectionId))
    .filter((c) => !filters.type || kindOf(c) === filters.type)
    .filter((c) => !filters.from || watDate(c.receivedOn) >= filters.from)
    .filter((c) => !filters.to || watDate(c.receivedOn) <= filters.to)
    .sort(byDateDesc((c) => c.receivedOn))
    .map(enrich);

  const summarise = (list: ContributionRow[]) => {
    const recorded = list.filter((r) => r.status === "recorded");
    return { amount: recorded.reduce((s, r) => s + r.amount, 0), count: recorded.length, voided: list.length - recorded.length };
  };

  const centralRows = rows.filter((r) => r.ledger === "central");
  const centralGroup = seesCentral && centralRows.length
    ? [{ chapterId: CENTRAL_LEDGER, chapterName: "Central (NCUDA)", regionName: "Central ledger — money received by the central body" as string | null, rows: centralRows, totals: summarise(centralRows) }]
    : [];

  const chapterGroups = d.chapters
    .filter((c) => chapterIds.includes(c.id))
    .map((c) => {
      const list = rows.filter((r) => r.ledger === "chapter" && r.chapterId === c.id);
      return {
        chapterId: c.id,
        chapterName: c.name,
        regionName: c.regionId ? (d.regions.find((r) => r.id === c.regionId)?.name ?? null) : null,
        rows: list,
        totals: summarise(list),
      };
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => byName(a.chapterName, b.chapterName));

  return {
    rows,
    // The central ledger first, then chapters alphabetically.
    groups: [...centralGroup, ...chapterGroups],
    chapterIds,
    seesCentral,
    totals: summarise(rows),
    recordableChapterIds: ledgerChaptersWhere(actor, "RECORD_CONTRIBUTION", o),
    canRecordCentral: canWriteLedger(actor, "RECORD_CONTRIBUTION", "central", null, o),
    canVoid: (row: Contribution) => canWriteLedger(actor, "VOID_CONTRIBUTION", row.ledger, row.chapterId, o),
  };
}

/** Chapters whose aggregate figures the actor may see (records or reports). */
function aggregateChapters(actor: Actor) {
  const o = org();
  return [...new Set([...chaptersWhere(actor, "VIEW_CONTRIBUTIONS", o), ...chaptersWhere(actor, "VIEW_FINANCIAL_REPORTS", o)])];
}

/** Collections the actor can see: in their own line, or within their finance/collection scope. */
export function visibleCollections(actor: Actor) {
  const o = org();
  const viewable = aggregateChapters(actor);
  return db()
    .collections.filter(
      (c) =>
        inMembershipLine(actor, c.scope) ||
        canIn(actor, "MANAGE_COLLECTIONS", c.scope) ||
        canIn(actor, "VIEW_CONTRIBUTIONS", c.scope) ||
        canIn(actor, "VIEW_FINANCIAL_REPORTS", c.scope) ||
        (c.scope.level !== "organization" && viewable.some((id) => scopeCovers(c.scope, { chapterId: id }, o))),
    )
    // Organisation-wide projects first, then regional, then chapter; newest first within each.
    .sort((a, b) => {
      const rank = { organization: 0, region: 1, chapter: 2 } as const;
      return rank[a.scope.level] - rank[b.scope.level] || b.startsOn.localeCompare(a.startsOn);
    });
}

/**
 * Each visible project: what is expected from the members it covers, what
 * they have paid (in either ledger), and what is still outstanding — by
 * chapter. Figures only include chapters whose finances the actor may see;
 * names of people who still owe need VIEW_CONTRIBUTIONS for their chapter.
 */
export function collectionSummaries(actor: Actor) {
  const o = org();
  const d = db();
  const viewable = aggregateChapters(actor);
  const namesIn = chaptersWhere(actor, "VIEW_CONTRIBUTIONS", o);
  return visibleCollections(actor).map((col) => {
    const coveredChapters = d.chapters.filter((ch) => scopeCovers(col.scope, { chapterId: ch.id }, o));
    const started = col.startsOn.slice(0, 10) <= today();
    const byChapter = coveredChapters
      .filter((ch) => viewable.includes(ch.id))
      .map((ch) => {
        const people = d.members
          .filter((m) => m.status === "active" && currentChapterId(m.id) === ch.id)
          .map((m) => {
            const expected = expectedFor(col, m.id);
            const paid = paidByCollection(m.id)[col.id] ?? 0;
            return { memberId: m.id, name: m.fullName, executive: isExecutive(m.id), expected, paid, balance: started ? Math.max(0, expected - paid) : 0 };
          })
          .filter((p) => p.expected > 0 || p.paid > 0);
        const sum = (k: "expected" | "paid" | "balance") => people.reduce((s, p) => s + p[k], 0);
        return {
          chapterId: ch.id,
          chapterName: ch.name,
          expected: sum("expected"),
          collected: sum("paid"),
          outstanding: sum("balance"),
          people: people.length,
          paidInFull: people.filter((p) => p.paid >= p.expected).length,
          // Only officers who may see the chapter's records see who owes.
          debtors: namesIn.includes(ch.id) ? people.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name)) : null,
        };
      })
      .sort((a, b) => byName(a.chapterName, b.chapterName));
    const sum = (k: "expected" | "collected" | "outstanding" | "people" | "paidInFull") => byChapter.reduce((s, b) => s + b[k], 0);
    return {
      ...col,
      scopeLabel: scopeLabel(col.scope),
      createdByName: memberName(col.createdBy),
      createdByPost: postAt(col.createdBy, col.createdAt),
      started,
      expectedTotal: sum("expected"),
      collected: sum("collected"),
      outstanding: sum("outstanding"),
      people: sum("people"),
      paidInFull: sum("paidInFull"),
      byChapter,
      partial: byChapter.length < coveredChapters.length,
    };
  });
}

/** Fines with an unpaid balance that the actor may see. */
export function outstandingFines(actor: Actor) {
  const o = org();
  const chapterIds = chaptersWhere(actor, "VIEW_CONTRIBUTIONS", o);
  const seesCentral = can(actor, "VIEW_CONTRIBUTIONS", { organization: true }, o);
  return fineBalances((f) => (f.ledger === "central" ? seesCentral : chapterIds.includes(f.chapterId)))
    .filter((f) => f.balance > 0)
    .map((f) => ({ ...f, row: enrich(f.fine) }))
    .sort((a, b) => b.balance - a.balance);
}

/** Collections a central-ledger payment may be made towards (organisation-wide ones). */
export function centralCollections() {
  return db().collections.filter((c) => c.scope.level === "organization");
}

/** Collections a payment for a member of `chapterId` may be made towards. */
export function collectionsForChapter(chapterId: string) {
  const o = org();
  return db().collections.filter((c) => scopeCovers(c.scope, { chapterId }, o));
}

/** Scopes in which the actor may set up a new project: exactly where they hold MANAGE_COLLECTIONS. */
export function collectionScopeOptions(actor: Actor) {
  const scopes = exactScopesWhere(actor, "MANAGE_COLLECTIONS");
  if (scopes.length === 0) return null;
  return scopes.map((s) => ({
    value: s.level === "organization" ? "organization" : s.level === "region" ? `region:${s.regionId}` : `chapter:${s.chapterId}`,
    label: s.level === "organization" ? "Whole organisation (raised by every chapter)" : scopeLabel(s),
  }));
}

/* ── Expenses (money out) ───────────────────────────────────────────── */

export type ExpenseRow = Expense & { scopeLabel: string; recordedByName: string };

const FINANCE_VIEW: Permission[] = ["VIEW_CONTRIBUTIONS", "VIEW_FINANCIAL_REPORTS"];

/** Visible up the hierarchy: anyone with finance access covering the body that spent the money. */
export function expenseVisible(actor: Actor, e: Expense) {
  // Money given to a committee is shown on the committee's own page — and, for a chapter project, in the chapter's books.
  if (e.committeeId && e.scope.level !== "chapter") return false;
  return canAnyIn(actor, FINANCE_VIEW, e.scope) || canAtExactly(actor, "RECORD_EXPENSE", e.scope);
}

const scopeKey = (s: Scope) => (s.level === "organization" ? CENTRAL_LEDGER : s.level === "region" ? `region:${s.regionId}` : s.chapterId);

export function scopedExpenses(actor: Actor) {
  const d = db();
  const rows: ExpenseRow[] = d.expenses
    .filter((e) => expenseVisible(actor, e))
    .sort(byDateDesc((e) => e.spentOn))
    .map((e) => ({ ...e, scopeLabel: e.scope.level === "organization" ? "Central (NCUDA)" : scopeLabel(e.scope), recordedByName: memberName(e.recordedBy) }));
  const groups = new Map<string, { key: string; label: string; level: Scope["level"]; rows: ExpenseRow[]; total: number; voided: number }>();
  for (const r of rows) {
    const key = scopeKey(r.scope);
    const g = groups.get(key) ?? { key, label: r.scopeLabel, level: r.scope.level, rows: [], total: 0, voided: 0 };
    g.rows.push(r);
    if (r.status === "recorded") g.total += r.amount;
    else g.voided += 1;
    groups.set(key, g);
  }
  const rank = { organization: 0, region: 1, chapter: 2 } as const;
  return {
    groups: [...groups.values()].sort((a, b) => rank[a.level] - rank[b.level] || byName(a.label, b.label)),
    total: rows.filter((r) => r.status === "recorded").reduce((s, r) => s + r.amount, 0),
    canVoid: (e: Expense) => canAtExactly(actor, "RECORD_EXPENSE", e.scope),
    scopes: expenseScopeOptions(actor),
  };
}

/** Whose funds the actor may record spending from. */
export function expenseScopeOptions(actor: Actor) {
  return exactScopesWhere(actor, "RECORD_EXPENSE").map((s) => ({
    value: s.level === "organization" ? "organization" : s.level === "region" ? `region:${s.regionId}` : `chapter:${s.chapterId}`,
    label: s.level === "organization" ? "Central funds (NCUDA)" : scopeLabel(s),
  }));
}

/* ── Summary ────────────────────────────────────────────────────────── */

/** This year's money in and out, per body whose reports the actor may see. */
export function financialSummary(actor: Actor) {
  const o = org();
  const d = db();
  const chapterIds = chaptersWhere(actor, "VIEW_FINANCIAL_REPORTS", o);
  const seesCentral = can(actor, "VIEW_FINANCIAL_REPORTS", { organization: true }, o);
  if (chapterIds.length === 0 && !seesCentral) return null;
  const year = new Date().getFullYear().toString();
  const thisYear = (on: string) => on.startsWith(year);
  const card = (key: string, name: string, keepIn: ((c: Contribution) => boolean) | null, keepOut: (e: Expense) => boolean) => {
    const rows = keepIn ? d.contributions.filter((c) => keepIn(c) && c.status === "recorded" && thisYear(c.receivedOn)) : [];
    const byKind: Record<PaymentKind, number> = { contribution: 0, fine: 0, registration: 0 };
    for (const r of rows) byKind[kindOf(r)] += r.amount;
    const income = rows.reduce((s, r) => s + r.amount, 0);
    const spent = d.expenses.filter((e) => (!e.committeeId || e.scope.level === "chapter") && keepOut(e) && e.status === "recorded" && thisYear(e.spentOn)).reduce((s, e) => s + e.amount, 0);
    return { key, name, hasIncome: !!keepIn, income, count: rows.length, byKind, spent, balance: income - spent };
  };
  const regionIds = d.regions.filter((r) => can(actor, "VIEW_FINANCIAL_REPORTS", { regionId: r.id }, o)).map((r) => r.id);
  return [
    ...(seesCentral ? [card(CENTRAL_LEDGER, "Central (NCUDA)", (c) => c.ledger === "central", (e) => e.scope.level === "organization")] : []),
    // Regions hold no ledger of their own (members pay through their chapters); they can still spend.
    ...regionIds
      .map((id) => card(`region:${id}`, regionName(id) ?? "Region", null, (e) => e.scope.level === "region" && e.scope.regionId === id))
      .filter((c) => c.spent > 0)
      .sort((a, b) => byName(a.name, b.name)),
    ...chapterIds
      .map((id) => card(id, chapterName(id), (c) => c.ledger === "chapter" && c.chapterId === id, (e) => e.scope.level === "chapter" && e.scope.chapterId === id))
      .sort((a, b) => byName(a.name, b.name)),
  ];
}

/* ── Recording forms ────────────────────────────────────────────────── */

/** What the record-a-payment forms need to know about each payer, to show expected amounts and balances. */
function payerInfo(memberId: ID, ledger: Contribution["ledger"]) {
  const reg = registrationStanding(memberId);
  return {
    executive: isExecutive(memberId),
    // "registration": what they paid for the registration in force (0 = not yet).
    paid: { ...paidByCollection(memberId), registration: reg.registered ? reg.paid : 0 },
    /** Their chapter's registration fee (null until set). */
    registrationFee: reg.fee,
    fines: fineBalances((f) => f.memberId === memberId && f.ledger === ledger)
      .filter((f) => f.balance > 0)
      .map((f) => ({ id: f.fine.id, description: f.fine.description, balance: f.balance })),
  };
}

const projectOption = (c: Collection) => ({ id: c.id, name: c.name, purpose: c.description, expected: c.expected });
export type ProjectOption = ReturnType<typeof projectOption>;
export type PayerOption = { value: string; label: string; chapterId: string | null } & ReturnType<typeof payerInfo>;

/** Payers and projects for the National Financial Secretary's form. */
export function centralPayerOptions(actor: Actor) {
  if (!canWriteLedger(actor, "RECORD_CONTRIBUTION", "central", null, org())) return null;
  const d = db();
  return {
    // Payments are kept against the payer's chapter, so people not yet in a chapter can't be recorded.
    members: d.members
      .filter((m) => m.status === "active" && currentChapterId(m.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((m): PayerOption => ({ value: `member:${m.id}`, label: `${m.fullName} — ${chapterName(currentChapterId(m.id))}`, chapterId: currentChapterId(m.id), ...payerInfo(m.id, "central") })),
    projects: onlyRegistrationIfInactive(actor, centralCollections()).map(projectOption),
  };
}

/** An inactive Financial Secretary may only record registration payments (not ordinary projects). */
const onlyRegistrationIfInactive = (actor: Actor, list: Collection[]) => (actor.inactive ? [] : list);

/** Members (with balances) and projects for a chapter Financial Secretary's form. */
export function contributionMemberOptions(actor: Actor) {
  const chapterIds = ledgerChaptersWhere(actor, "RECORD_CONTRIBUTION", org());
  const members = db()
    .members.filter((m) => m.status === "active")
    .map((m) => ({ ...m, chapterId: currentChapterId(m.id) }))
    .filter((m) => m.chapterId && chapterIds.includes(m.chapterId))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((m): PayerOption => ({ value: m.id, label: `${m.fullName} — ${chapterName(m.chapterId)}`, chapterId: m.chapterId, ...payerInfo(m.id, "chapter") }));
  const projects = chapterIds
    .flatMap((chapterId) => onlyRegistrationIfInactive(actor, collectionsForChapter(chapterId)).map((c) => ({ c, chapterId })))
    .reduce<Array<ProjectOption & { chapterIds: string[] }>>((acc, { c, chapterId }) => {
      const found = acc.find((x) => x.id === c.id);
      if (found) found.chapterIds.push(chapterId);
      else acc.push({ ...projectOption(c), chapterIds: [chapterId] });
      return acc;
    }, []);
  return { members, projects, registrationYear: registrationYear() };
}

/* ── Yearly registration ────────────────────────────────────────────── */

/**
 * For a Financial Secretary: everyone in their chapter(s) whose registration
 * for the year in force is not yet recorded (officers included), with the
 * chapter's fee, so each can be recorded in one click. Their own comes first.
 */
export function registrationToCollect(actor: Actor) {
  const chapterIds = ledgerChaptersWhere(actor, "RECORD_CONTRIBUTION", org());
  if (chapterIds.length === 0) return null;
  const d = db();
  const people = d.members
    .filter((m) => m.status === "active")
    .map((m) => ({ m, chapterId: currentChapterId(m.id) }))
    .filter((x): x is { m: Member; chapterId: string } => !!x.chapterId && chapterIds.includes(x.chapterId))
    .filter((x) => !registrationStanding(x.m.id).registered)
    .map(({ m, chapterId }) => ({
      id: m.id,
      name: m.fullName,
      post: d.assignments.filter((x) => x.memberId === m.id && x.status === "active").map((x) => roleName(x.roleKey)).join(", ") || null,
      chapterId,
      chapterName: chapterName(chapterId),
      fee: chapterFee(chapterId),
    }))
    .sort((x, y) => (x.id === actor.member.id ? -1 : y.id === actor.member.id ? 1 : x.name.localeCompare(y.name)));
  return { year: registrationYear(), people };
}

/**
 * The Financial Secretary's registration desk, per chapter they register
 * members in: the chapter's fee, who still has to pay (themselves first),
 * and who has paid for the year in force (with receipts).
 */
export function registrationDesk(actor: Actor) {
  const chapterIds = chaptersWhere(actor, "CREATE_MEMBER", org());
  if (chapterIds.length === 0) return null;
  const d = db();
  const unpaid = registrationToCollect(actor)?.people ?? [];
  return {
    year: registrationYear(),
    chapters: [...chapterIds].sort((a, b) => byName(chapterName(a), chapterName(b))).map((chapterId) => {
      const paid = d.members
        .filter((m) => currentChapterId(m.id) === chapterId)
        .map((m) => ({ m, payment: currentRegistrationPayment(m.id) }))
        .filter((x): x is { m: Member; payment: Contribution } => !!x.payment)
        .map(({ m, payment }) => ({
          id: m.id,
          name: m.fullName,
          post: d.assignments.filter((x) => x.memberId === m.id && x.status === "active").map((x) => roleName(x.roleKey)).join(", ") || null,
          amount: payment.amount,
          on: payment.receivedOn,
          reference: payment.reference,
        }))
        .sort((x, y) => y.on.localeCompare(x.on));
      return { chapterId, name: chapterName(chapterId), fee: chapterFee(chapterId), unpaid: unpaid.filter((u) => u.chapterId === chapterId), paid };
    }),
  };
}

/** The registration page: the year in force and who has (not) paid, by chapter. */
export function registrationOverview(actor: Actor) {
  const o = org();
  const d = db();
  // National (President General: also runs the yearly renewal) or, read-only, the coordinator's region(s).
  const national = can(actor, "MANAGE_REGISTRATION", { organization: true }, o);
  const regionIds = national ? [] : d.regions.filter((r) => can(actor, "VIEW_CONTRIBUTIONS", { regionId: r.id }, o)).map((r) => r.id);
  if (!national && regionIds.length === 0) return null;
  const chapters = national ? d.chapters : d.chapters.filter((c) => c.regionId && regionIds.includes(c.regionId));
  const renewal = currentRenewal();
  const people = d.members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, name: m.fullName, chapterId: currentChapterId(m.id), executive: isExecutive(m.id), standing: registrationStanding(m.id) }))
    .filter((p) => national || chapters.some((c) => c.id === p.chapterId));
  const byChapter = [...[...chapters].sort((a, b) => byName(a.name, b.name)).map((c) => ({ id: c.id as string | null, name: c.name })), ...(national ? [{ id: null, name: "Not in a chapter yet" }] : [])]
    .map((c) => {
      const list = people.filter((p) => p.chapterId === c.id);
      return {
        ...c,
        fee: chapterFee(c.id),
        total: list.length,
        registered: list.filter((p) => p.standing.registered).length,
        unpaid: list.filter((p) => !p.standing.registered).map((p) => ({ id: p.id, name: p.name, executive: p.executive, fee: p.standing.fee })),
      };
    })
    .filter((c) => c.total > 0 || c.id !== null);
  return {
    national,
    regionNames: regionIds.map((id) => regionName(id) ?? "Region"),
    renewal,
    year: registrationYear(),
    total: people.length,
    registered: people.filter((p) => p.standing.registered).length,
    byChapter,
    history: (d.renewals ?? []).map((r) => ({ ...r, openedByName: memberName(r.openedBy) })).reverse(),
    suggestedYear: Math.max(new Date().getFullYear(), ...(d.renewals ?? []).map((r) => r.year + 1)),
  };
}

/* ── Documents ──────────────────────────────────────────────────────── */

export function listDocuments(actor: Actor) {
  return db()
    .documents.filter((doc) => documentVisible(actor, doc))
    .sort(byDateDesc((doc) => doc.uploadedAt))
    .map((doc) => ({
      ...doc,
      scopeLabel: scopeLabel(doc.scope),
      sharedWithLabel: doc.attachment
        ? "Attached to a message"
        : doc.roleKeys?.length
          ? `Shared with ${doc.roleKeys.map(rolePlural).join(", ")} · ${scopeLabel(doc.scope)}`
          : `Shared with ${scopeLabel(doc.scope)}`,
      uploadedByName: memberName(doc.uploadedBy),
      canDownload: documentDownloadable(actor, doc),
    }));
}

/** Attachments of a message that the actor may download. */
export function attachmentsFor(actor: Actor, n: NotificationRecord) {
  return (n.attachmentIds ?? [])
    .map((id) => db().documents.find((doc) => doc.id === id))
    .filter((doc): doc is NonNullable<typeof doc> => !!doc && documentDownloadable(actor, doc))
    .map((doc) => ({ id: doc.id, filename: doc.filename, sizeBytes: doc.sizeBytes }));
}

export function getDocumentForDownload(actor: Actor, id: ID) {
  const doc = db().documents.find((x) => x.id === id);
  return doc && documentDownloadable(actor, doc) ? doc : null;
}

/* ── Notifications ──────────────────────────────────────────────────── */

export function audienceLabel(a: NotificationRecord["audience"]) {
  if (a.kind === "member") return "Just you";
  if (a.kind === "scope") return scopeLabel(a.scope);
  return `${a.roleKeys.map(rolePlural).join(", ")} · ${scopeLabel(a.scope)}`;
}

/** Message types that may be forwarded down the chain of authority. */
export const FORWARDABLE_TYPES: NotificationRecord["type"][] = ["message", "announcement"];

/** The id of the original message a record descends from (itself if not a forward). */
export const rootId = (n: NotificationRecord) => n.forward?.originalId ?? n.id;

export function listNotifications(actor: Actor) {
  const d = db();
  const mayForward = hasAnywhere(actor, "MANAGE_NOTIFICATIONS");
  // Oldest first so that, when a member can see both an original and a
  // forward of it (or two forwards), only the first copy is kept.
  const seen = new Set<string>();
  const visible = d.notifications
    .filter((n) => notificationVisible(actor, n))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((n) => {
      const root = rootId(n);
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    });

  return visible
    .sort(byDateDesc((n) => n.createdAt))
    .map((n) => ({
      ...n,
      read: d.notificationReads.some((r) => r.notificationId === n.id && r.memberId === actor.member.id),
      audienceLabel: n.audience.kind === "member" ? "Just you" : audienceLabel(n.audience),
      senderName: n.createdBy ? memberName(n.createdBy) : "NCUDA Portal",
      forwardInfo: n.forward
        ? {
            originalSenderName: n.forward.originalSenderId ? memberName(n.forward.originalSenderId) : "NCUDA Portal",
            originalSentAt: n.forward.originalSentAt,
            forwardedByName: memberName(n.createdBy),
            viaNames: n.forward.via.map((id) => memberName(id)),
            note: n.forward.note,
          }
        : undefined,
      canForward: mayForward && FORWARDABLE_TYPES.includes(n.type),
      attachments: attachmentsFor(actor, n),
    }));
}

/** Everyone who already has a message (the original or any forward of it). */
export function holdersOf(originalId: ID) {
  const ids = new Set<string>();
  for (const n of db().notifications) {
    if (rootId(n) !== originalId) continue;
    recipientsOf(n.audience).forEach((m) => ids.add(m.id));
    if (n.createdBy) ids.add(n.createdBy);
  }
  return ids;
}

/** Who would receive a message to this audience (active members only). */
export function recipientsOf(audience: NotificationRecord["audience"]) {
  const d = db();
  const o = org();
  return d.members.filter((m) => {
    if (m.status !== "active") return false;
    if (audience.kind === "member") return m.id === audience.memberId;
    const chapterId = currentChapterId(m.id);
    if (!chapterId || !scopeCovers(audience.scope, { chapterId }, o)) return false;
    if (audience.kind === "scope") return true;
    return d.assignments.some((a) => a.memberId === m.id && a.status === "active" && audience.roleKeys.includes(a.roleKey));
  });
}

/** Messages the actor has sent, newest first. */
export function sentMessages(actor: Actor) {
  return db()
    .notifications.filter((n) => n.createdBy === actor.member.id && (n.type === "message" || !!n.forward))
    .sort(byDateDesc((n) => n.createdAt))
    .map((n) => ({
      ...n,
      audienceLabel: audienceLabel(n.audience),
      recipientCount: recipientsOf(n.audience).length,
      originalSenderName: n.forward ? (n.forward.originalSenderId ? memberName(n.forward.originalSenderId) : "NCUDA Portal") : null,
    }));
}

/** The scopes the actor may message, and the roles they can target within them. */
export function messagingOptions(actor: Actor) {
  return audienceOptions(actor, "MANAGE_NOTIFICATIONS");
}

/** Who the actor may share an uploaded document with. */
export function uploadOptions(actor: Actor) {
  return audienceOptions(actor, "UPLOAD_DOCUMENT");
}

/** Scopes where the actor holds `permission`, and the offices they can target within them. */
function audienceOptions(actor: Actor, permission: "MANAGE_NOTIFICATIONS" | "UPLOAD_DOCUMENT") {
  if (!hasAnywhere(actor, permission)) return null;
  const d = db();
  const scopes: Array<{ value: string; label: string }> = [];
  if (canIn(actor, permission, { level: "organization" })) scopes.push({ value: "organization", label: "Whole organisation" });
  for (const r of d.regions) {
    if (canIn(actor, permission, { level: "region", regionId: r.id })) scopes.push({ value: `region:${r.id}`, label: r.name });
  }
  for (const c of d.chapters) {
    if (canIn(actor, permission, { level: "chapter", chapterId: c.id })) scopes.push({ value: `chapter:${c.id}`, label: c.name });
  }
  // Offer only offices that can exist below the sender: someone whose
  // widest scope is a chapter has no coordinators or other presidents under them.
  const widest = scopes.some((s) => s.value === "organization") ? "organization" : scopes.some((s) => s.value.startsWith("region:")) ? "region" : "chapter";
  const roles = ROLES.filter((r) => {
    if (r.key === "PRESIDENT_GENERAL") return false;
    if (widest === "chapter") return r.scopeLevel === "chapter" && r.key !== "CHAPTER_PRESIDENT";
    if (widest === "region") return r.scopeLevel === "chapter";
    return true;
  }).map((r) => ({ key: r.key, name: rolePlural(r.key) }));
  return { scopes, roles };
}

/* ── Action items ───────────────────────────────────────────────────── */

export function myActionItems(actor: Actor) {
  const d = db();
  return d.actionItems
    .filter((a) => a.assigneeId === actor.member.id && a.status !== "completed")
    .sort(byDateAsc((a) => a.dueDate))
    .map((a) => ({ ...a, meeting: d.meetings.find((m) => m.id === a.meetingId)! }));
}

export function scopedOpenActionItems(actor: Actor) {
  const d = db();
  // Those who keep them (Secretaries) and those who run meetings there (Presidents) follow open actions.
  const follows = (scope: Scope) => canIn(actor, "EDIT_ACTION_ITEM", scope) || canIn(actor, "EDIT_MEETING", scope);
  if (!hasAnywhere(actor, "EDIT_ACTION_ITEM") && !hasAnywhere(actor, "EDIT_MEETING")) return null;
  return d.actionItems
    .filter((a) => a.status !== "completed")
    .filter((a) => {
      const m = d.meetings.find((x) => x.id === a.meetingId);
      return m && follows(m.scope);
    })
    .sort(byDateAsc((a) => a.dueDate))
    .map((a) => ({ ...a, assigneeName: memberName(a.assigneeId) }));
}

/* ── Members & roles ────────────────────────────────────────────────── */

export type MemberRow = Member & { chapterId: string | null; chapterName: string; roles: string[]; registrationDue: number | null };

/**
 * The post someone held at a given moment, named with its place — e.g.
 * "Buea Financial Secretary", "South-West Regional Coordinator",
 * "National Financial Secretary". Falls back to their name.
 */
export function postAt(memberId: ID, at: string) {
  const d = db();
  const a = d.assignments.find((x) => x.memberId === memberId && x.assignedAt <= at && (!x.endedAt || x.endedAt > at));
  if (!a) return memberName(memberId);
  const name = roleName(a.roleKey);
  if (a.scope.level === "chapter") return `${chapterName(a.scope.chapterId)} ${name.replace(/^Chapter /, "")}`;
  if (a.scope.level === "region") return `${regionName(a.scope.regionId) ?? "Region"} ${name}`;
  return name;
}

/**
 * The order members are listed in starts at the viewer's own level. Each
 * group of executives is sorted by rank, and ordinary members come last, A–Z.
 *  - National executives: national executives, Regional Coordinators, chapter executives.
 *  - Regional Coordinators: Regional Coordinators, chapter executives, national executives.
 *  - Chapter executives: chapter executives, Regional Coordinators, national executives.
 * Chapter ranks: President, Vice President, Secretary, Vice Secretary,
 * Financial Secretary, Treasurer, Socials.
 */
const CHAPTER_ORDER = ["CHAPTER_PRESIDENT", "CHAPTER_VICE_PRESIDENT", "CHAPTER_SECRETARY", "CHAPTER_VICE_SECRETARY", "FINANCIAL_SECRETARY", "TREASURER", "SOCIALS", "SOCIALS_VICE"];
const NATIONAL_ORDER = ["PRESIDENT_GENERAL", "VICE_PRESIDENT_GENERAL", "SECRETARY_GENERAL", "CENTRAL_FINANCIAL_SECRETARY", "CENTRAL_TREASURER"];
type Level = "national" | "regional" | "chapter";
const GROUP_ORDER: Record<Level, Level[]> = {
  national: ["national", "regional", "chapter"],
  regional: ["regional", "chapter", "national"],
  chapter: ["chapter", "regional", "national"],
};
/** The viewer's level: their widest post (members without a post see it as a chapter executive would). */
export function viewerLevel(actor: Actor): Level {
  const levels = actor.roles.map((r) => r.role.scopeLevel);
  return levels.includes("organization") ? "national" : levels.includes("region") ? "regional" : "chapter";
}
export function memberStanding(roles: string[], viewer: Level = "chapter"): [number, number] {
  const ranked = (order: string[]) => Math.min(...roles.map((r) => order.indexOf(r)).filter((i) => i >= 0));
  const groups = GROUP_ORDER[viewer];
  if (roles.some((r) => NATIONAL_ORDER.includes(r)) && viewer === "national") return [groups.indexOf("national"), ranked(NATIONAL_ORDER)];
  if (roles.some((r) => CHAPTER_ORDER.includes(r))) return [groups.indexOf("chapter"), ranked(CHAPTER_ORDER)];
  if (roles.includes("REGIONAL_COORDINATOR")) return [groups.indexOf("regional"), 0];
  if (roles.some((r) => NATIONAL_ORDER.includes(r))) return [groups.indexOf("national"), ranked(NATIONAL_ORDER)];
  return [3, 0];
}
const byStanding = (viewer: Level) => (a: { roles: string[]; fullName: string }, b: { roles: string[]; fullName: string }) => {
  const [ga, ra] = memberStanding(a.roles, viewer);
  const [gb, rb] = memberStanding(b.roles, viewer);
  return ga - gb || ra - rb || a.fullName.localeCompare(b.fullName);
};

export function listMembers(actor: Actor): { rows: MemberRow[]; chapterIds: string[]; creatableChapterIds: string[] } | null {
  const o = org();
  const chapterIds = chaptersWhere(actor, "VIEW_MEMBER", o);
  const seesAll = can(actor, "VIEW_MEMBER", { organization: true }, o);
  if (chapterIds.length === 0 && !seesAll) return null;
  const d = db();
  const rows = d.members
    .map((m) => {
      const chapterId = currentChapterId(m.id);
      return {
        ...m,
        chapterId,
        chapterName: chapterName(chapterId),
        roles: d.assignments.filter((a) => a.memberId === m.id && a.status === "active").map((a) => a.roleKey),
        // The year whose registration is unpaid (inactive), if any.
        registrationDue: registrationStanding(m.id).registered ? null : registrationStanding(m.id).year,
      };
    })
    // People not in a chapter yet (e.g. a new Regional Coordinator) are visible organisation-wide.
    .filter((m) => (m.chapterId ? chapterIds.includes(m.chapterId) : seesAll))
    .sort(byStanding(viewerLevel(actor)));
  return { rows, chapterIds, creatableChapterIds: chaptersWhere(actor, "CREATE_MEMBER", o) };
}

export function getMemberDetail(actor: Actor, memberId: ID) {
  const d = db();
  const member = d.members.find((m) => m.id === memberId);
  if (!member) return null;
  const chapterId = currentChapterId(member.id);
  const self = member.id === actor.member.id;
  if (!self && !(chapterId ? can(actor, "VIEW_MEMBER", { chapterId }, org()) : can(actor, "VIEW_MEMBER", { organization: true }, org()))) return null;

  return {
    member,
    chapterId,
    chapterName: chapterName(chapterId),
    chapterHistory: d.affiliations
      .filter((a) => a.memberId === member.id)
      .sort(byDateDesc((a) => a.startedAt))
      .map((a) => ({ ...a, chapterName: chapterName(a.chapterId), recordedByName: memberName(a.recordedBy) })),
    roleHistory: d.assignments
      .filter((a) => a.memberId === member.id)
      .sort(byDateDesc((a) => a.assignedAt))
      .map((a) => ({
        ...a,
        scopeLabel: scopeLabel(a.scope),
        assignedByName: a.assignedBy ? memberName(a.assignedBy) : "Recorded by system (election)",
        endedByName: a.endedBy ? memberName(a.endedBy) : null,
      })),
    createdByName: member.createdBy ? memberName(member.createdBy) : "System",
    statusChange: member.statusChange
      ? { ...member.statusChange, byName: memberName(member.statusChange.by) }
      : null,
    statusDecision: chapterId
      ? canChangeMemberStatus(
          actor,
          {
            targetMemberId: member.id,
            targetChapterId: chapterId,
            targetRoleKeys: d.assignments.filter((a) => a.memberId === member.id && a.status === "active").map((a) => a.roleKey),
          },
          org(),
        )
      : ({ ok: false, reason: "No current chapter." } as const),
  };
}

/** Every post held now, with its holder — so the assign form can say a post is taken. */
export function postHolders(actor: Actor) {
  const o = org();
  return db()
    .assignments.filter((a) => a.status === "active")
    .map((a) => ({
      roleKey: a.roleKey,
      scopeKey: a.scope.level === "organization" ? "organization" : a.scope.level === "region" ? `region:${a.scope.regionId}` : `chapter:${a.scope.chapterId}`,
      assignmentId: a.id,
      name: memberName(a.memberId),
      canEnd: canEndRole(actor, a, o).ok,
    }));
}

/** The region a chapter belongs to. */
export const chapterRegionOf = (chapterId: ID | null) => db().chapters.find((c) => c.id === chapterId)?.regionId ?? null;

/** Regions in which the actor may assign regional roles. */
export function assignableRegions(actor: Actor) {
  const o = org();
  return db()
    .regions.filter((r) => can(actor, "ASSIGN_ROLE", { regionId: r.id }, o))
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function rolesOverview(actor: Actor) {
  const o = org();
  if (!hasAnywhere(actor, "ASSIGN_ROLE") && !hasAnywhere(actor, "VIEW_MEMBER")) return null;
  const d = db();
  const visibleAssignment = (scope: (typeof d.assignments)[number]["scope"]) => {
    if (scope.level === "organization") return true; // Holders of central office are public within the portal.
    if (scope.level === "region") return actor.grants.some((g) => (g.permission === "VIEW_MEMBER" || g.permission === "ASSIGN_ROLE") && scopeCovers(g.scope, { regionId: scope.regionId }, o));
    return can(actor, "VIEW_MEMBER", { chapterId: scope.chapterId }, o) || can(actor, "ASSIGN_ROLE", { chapterId: scope.chapterId }, o);
  };
  const assignments = d.assignments
    .filter((a) => visibleAssignment(a.scope))
    .sort(byDateDesc((a) => a.assignedAt))
    .map((a) => ({
      ...a,
      memberName: memberName(a.memberId),
      scopeLabel: scopeLabel(a.scope),
      assignedByName: a.assignedBy ? memberName(a.assignedBy) : "System (election)",
      endedByName: a.endedBy ? memberName(a.endedBy) : null,
    }));

  const delegations = d.delegations
    .filter((x) => x.grantedTo === actor.member.id || x.grantedBy === actor.member.id || hasAnywhere(actor, "VIEW_AUDIT_LOG"))
    .map((x) => ({ ...x, grantedByName: memberName(x.grantedBy), grantedToName: memberName(x.grantedTo), scopeLabel: scopeLabel(x.scope) }));

  return { roles: ROLES, assignments, delegations };
}

/* ── Audit ──────────────────────────────────────────────────────────── */

/** National 0, regional 1, chapter 2. */
const LEVEL_RANK = { organization: 0, region: 1, chapter: 2 } as const;

/** The level of the highest post someone held when they acted (from the roles recorded with the entry); members count as chapter level. */
function actorLevel(roleKeys: string[]) {
  return Math.min(2, ...roleKeys.map((k) => LEVEL_RANK[ROLES.find((r) => r.key === k)?.scopeLevel ?? "chapter"]));
}

/**
 * The audit log follows the hierarchy, by post: an officer sees what happened
 * in their area (their chapter, region or the organisation) — but nothing done
 * by someone whose post at the time was at a higher level. A Chapter President
 * sees his chapter's chapter-level actions, not those of a Regional Coordinator
 * or national officer; a Regional Coordinator sees her region's chapter and
 * regional actions, not national ones; the President General sees everything.
 */
export function listAudit(actor: Actor, limit = 200) {
  const o = org();
  if (!hasAnywhere(actor, "VIEW_AUDIT_LOG")) return null;
  const grants = actor.grants.filter((g) => g.permission === "VIEW_AUDIT_LOG");
  const visible = (e: AuditEntry) => {
    const target: Target = e.chapterId ? { chapterId: e.chapterId } : e.regionId ? { regionId: e.regionId } : { organization: true };
    // The highest level at which the viewer's posts reach this entry.
    const reach = grants.filter((g) => scopeCovers(g.scope, target, o)).map((g) => LEVEL_RANK[g.scope.level]);
    if (reach.length === 0) return false;
    return actorLevel(e.actorRoles) >= Math.min(...reach);
  };
  return db()
    .audit.filter(visible)
    .sort(byDateDesc((e) => e.at))
    .slice(0, limit)
    .map((e) => ({ ...e, actorName: memberName(e.actorId), chapterName: e.chapterId ? chapterName(e.chapterId) : null }));
}

/* ── Chapters ───────────────────────────────────────────────────────── */

/** Holds an office in some chapter right now? (Such a member cannot be moved to lead another chapter.) */
/**
 * The post a member currently holds, if any. One person holds at most one
 * post at a time; to move someone to another post, their current one is
 * ended first.
 */
export function currentPost(memberId: string) {
  const a = db().assignments.find((x) => x.memberId === memberId && x.status === "active");
  return a ? { assignment: a, label: `${roleName(a.roleKey)}, ${scopeLabel(a.scope)}` } : null;
}

/**
 * Members `actor` could pick to lead a new chapter: active, not themselves,
 * and either visible to the actor (VIEW_MEMBER over their chapter) or not yet
 * in any chapter. Those holding a post are listed but cannot be picked until
 * that post is ended.
 */
export function chapterPresidentCandidates(actor: Actor) {
  const o = org();
  return db()
    .members.filter((m) => m.status === "active" && m.id !== actor.member.id)
    .map((m) => ({ ...m, chapterId: currentChapterId(m.id) }))
    .filter((m) => !m.chapterId || can(actor, "VIEW_MEMBER", { chapterId: m.chapterId }, o));
}

/** Members the President General could make a Regional Coordinator: any active member except themselves. */
/** Who may become a region's coordinator: members of that region's chapters (none yet for a new region). */
export function coordinatorCandidates(actor: Actor, regionId: ID | null) {
  if (!can(actor, "CREATE_REGION", { organization: true }, org())) return [];
  const d = db();
  return d.members.filter((m) => m.status === "active" && m.id !== actor.member.id && !!regionId && d.chapters.find((c) => c.id === currentChapterId(m.id))?.regionId === regionId);
}

/** A member as a pick-list option: "Name — Chapter". Post holders are shown, but disabled. */
const candidateOption = (m: Member) => {
  const chapterId = currentChapterId(m.id);
  const post = currentPost(m.id);
  return {
    id: m.id,
    label: `${m.fullName} — ${chapterId ? chapterName(chapterId) : "not in a chapter yet"}${post ? ` · currently ${post.label} (uplift that post first)` : ""}`,
    disabled: !!post,
  };
};

/** May `actor` rename a chapter / change its location? Its region's coordinator, or the President General. */
export function canEditChapter(actor: Actor, chapter: { regionId: ID | null }) {
  return canCreateChapter(actor, chapter.regionId) || can(actor, "CREATE_REGION", { organization: true }, org());
}

/**
 * Where `actor` may move `memberId` (to another chapter, in the same region
 * or not). The President General moves anyone anywhere; a Regional
 * Coordinator within their region. Someone not yet in a chapter (e.g. a new
 * coordinator, or the President General) can be placed in one — including by
 * themselves. A member holding a chapter post gives it up first.
 */
export function transferOptions(actor: Actor, memberId: ID) {
  const o = org();
  const d = db();
  const member = d.members.find((m) => m.id === memberId);
  if (!member || member.status !== "active") return null;
  const from = currentChapterId(member.id);
  const self = member.id === actor.member.id;
  if (actor.inactive && !(self && !from)) return null; // while inactive: only placing yourself in a chapter
  if (self && from) return null; // you cannot move yourself between chapters
  if (from && !can(actor, "TRANSFER_MEMBER", { chapterId: from }, o)) return null;
  const destinations = d.chapters.filter((c) => c.id !== from && can(actor, "TRANSFER_MEMBER", { chapterId: c.id }, o));
  if (destinations.length === 0) return null;
  const post = currentPost(member.id);
  // Fines are settled before a member leaves their chapter.
  const finesOwed = finesOwedBy(member.id);
  return {
    from,
    blockedBy: post && post.assignment.scope.level === "chapter" ? post.label : null,
    finesOwed,
    destinations: destinations
      .map((c) => ({ id: c.id, name: c.name, regionName: c.regionId ? (regionName(c.regionId) ?? "—") : "No region" }))
      .sort((a, b) => byName(a.regionName, b.regionName) || byName(a.name, b.name)),
  };
}

/** Regions with their coordinators — for the President General, who creates regions. */
export function listRegions(actor: Actor) {
  if (!can(actor, "CREATE_REGION", { organization: true }, org())) return null;
  const d = db();
  return {
    regions: d.regions
      .map((r) => {
        const coordinator = d.assignments.find((a) => a.roleKey === "REGIONAL_COORDINATOR" && a.status === "active" && a.scope.level === "region" && a.scope.regionId === r.id);
        const person = coordinator ? d.members.find((m) => m.id === coordinator.memberId) : undefined;
        const chapterIds = new Set(d.chapters.filter((c) => c.regionId === r.id).map((c) => c.id));
        return {
          ...r,
          candidates: coordinatorCandidates(actor, r.id).map(candidateOption).sort((a, b) => a.label.localeCompare(b.label)),
          coordinatorName: coordinator ? memberName(coordinator.memberId) : null,
          coordinatorEmail: person?.email ?? null,
          coordinatorPhone: person?.phone ?? null,
          chapters: chapterIds.size,
          members: d.affiliations.filter((a) => a.endedAt === null && chapterIds.has(a.chapterId)).length,
        };
      })
      .sort((a, b) => byName(a.name, b.name)),
    // A new region has no chapters yet, so its coordinator is a new person.
    candidates: [],
  };
}

export function listChapters(actor: Actor) {
  const seesAll = can(actor, "CREATE_REGION", { organization: true }, org());
  if (!hasAnywhere(actor, "CREATE_CHAPTER") && !seesAll) return null;
  const d = db();
  // Where the actor may create chapters: the region(s) they coordinate.
  const regionOptions = d.regions.filter((r) => canCreateChapter(actor, r.id)).map(({ id, name }) => ({ id, name }));
  return {
    regions: regionOptions,
    presidentCandidates: chapterPresidentCandidates(actor).map(candidateOption).sort((a, b) => a.label.localeCompare(b.label)),
    chapters: d.chapters
      .filter((c) => seesAll || regionOptions.some((r) => r.id === c.regionId))
      .map((c) => {
        const members = d.affiliations.filter((a) => a.chapterId === c.id && a.endedAt === null).length;
        const president = d.assignments.find(
          (a) => a.roleKey === "CHAPTER_PRESIDENT" && a.status === "active" && a.scope.level === "chapter" && a.scope.chapterId === c.id,
        );
        return {
          ...c,
          regionName: c.regionId ? (d.regions.find((r) => r.id === c.regionId)?.name ?? "—") : null,
          members,
          presidentName: president ? memberName(president.memberId) : null,
          presidentEmail: president ? (d.members.find((m) => m.id === president.memberId)?.email ?? null) : null,
          presidentPhone: president ? (d.members.find((m) => m.id === president.memberId)?.phone ?? null) : null,
          canEdit: canEditChapter(actor, c),
        };
      })
      .sort((a, b) => byName(a.name, b.name)),
  };
}
