import "server-only";
import { z } from "zod";
import type { AttendanceStatus, Committee, CommitteeMembership, CommitteePosition, Expense, ID, Scope } from "@/lib/domain/types";
import { currentChapterId, db, newId, nextReference } from "@/lib/demo/store";
import { can, canAtExactly, exactScopesWhere, type Actor } from "@/lib/permissions/engine";
import { roleByKey } from "@/lib/permissions/roles";
import { formatDate, formatMoney, watToday } from "@/lib/utils";
import { recordAudit } from "./audit";
import { storeDocument, type CommandResult } from "./commands";
import { checkFile, MAX_ATTACHMENTS, type IncomingFile } from "./files";
import { attachmentsFor, chapterName, expectedFor, memberName, postAt } from "./queries";
import { sendProjectMoneyReceipt } from "./receipts";
import { org, scopeLabel } from "./visibility";

/*
 * Committees. A committee carries out one project: national ones are created
 * by the President General (project raised across the organisation), regional
 * ones by a Regional Coordinator (project raised across their region's
 * chapters), chapter ones by the Chapter President (a chapter project). Only
 * the creator adds people and gives positions; a creator is not on the
 * committee unless they add themselves. One active committee per person;
 * committee positions are separate from chapter and regional posts. A
 * committee is visible only to its members, its creator and the President
 * General (who oversees every committee) — and, for a chapter committee, the
 * Regional Coordinator of the chapter's region (read only).
 */

export const POSITIONS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "FINANCIAL_SECRETARY", "TREASURER"];
export const POSITION_LABEL: Record<CommitteePosition, string> = {
  PRESIDENT: "President",
  VICE_PRESIDENT: "Vice President",
  SECRETARY: "Secretary",
  FINANCIAL_SECRETARY: "Financial Secretary",
  TREASURER: "Treasurer",
};
/** Positions that see the committee's books (as in a chapter). */
const FINANCE_VIEWERS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT", "FINANCIAL_SECRETARY", "TREASURER"];
/** The committee's President — and its Vice President, who holds all of the President's powers. */
const LEADS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT"];
const leads = (pos: CommitteePosition | null | undefined) => !!pos && LEADS.includes(pos);

const DENIED = "You are not authorized to do this. The request was refused and nothing was changed.";
const fail = (error: string, fieldErrors?: Record<string, string>): CommandResult => ({ ok: false, error, fieldErrors });
const fieldErrorsFrom = (err: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.map(String).join(".")] ??= i.message; // nested fields: "financialSecretary.phone"
  return out;
};
const francs = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s,  ]/g, "") : v),
    z.coerce.number({ message }).int("Whole francs only.").min(0, "Cannot be negative.").max(100_000_000, "That amount is too large."),
  );

/* ── Reading ───────────────────────────────────────────────────────── */

const committees = () => db().committees ?? [];
const memberships = () => db().committeeMembers ?? [];

/** The President General oversees every committee. */
const oversees = (actor: Actor) => can(actor, "CREATE_COMMITTEE", { organization: true }, org());

/** The member's place on an active committee, if any (one at a time). */
export function activeCommitteeOf(memberId: ID) {
  const m = memberships().find((x) => x.memberId === memberId && x.endedAt === null && committees().find((c) => c.id === x.committeeId)?.status === "active");
  return m ? { membership: m, committee: committees().find((c) => c.id === m.committeeId)! } : null;
}

const myMembership = (actor: Actor, c: Committee) => memberships().find((m) => m.committeeId === c.id && m.memberId === actor.member.id && m.endedAt === null) ?? null;
const wasMember = (actor: Actor, c: Committee) => memberships().some((m) => m.committeeId === c.id && m.memberId === actor.member.id);

/** The President General oversees every committee; a Regional Coordinator, the chapter committees of their region. */
function overseesCommittee(actor: Actor, c: Committee) {
  if (oversees(actor)) return true;
  if (c.scope.level !== "chapter") return false;
  const regionId = db().chapters.find((ch) => ch.id === (c.scope as { chapterId: ID }).chapterId)?.regionId;
  return !!regionId && canAtExactly(actor, "CREATE_COMMITTEE", { level: "region", regionId });
}

/** The National Financial Secretary in office (who receives and holds national project money). */
function nationalFinancialSecretary() {
  return db().assignments.find((a) => a.roleKey === "CENTRAL_FINANCIAL_SECRETARY" && a.status === "active" && a.scope.level === "organization")?.memberId ?? null;
}

/**
 * A project's manager, who receives and holds its money — always the post, not
 * the person who created it: the National Financial Secretary in office for a
 * national project, the region's Regional Coordinator in office for a regional
 * one. A chapter project's money stays in the chapter (its Financial Secretary).
 */
function projectManagerId(p: { scope: Scope; createdBy: ID }) {
  if (p.scope.level === "organization") return nationalFinancialSecretary();
  if (p.scope.level !== "region") return null;
  const regionId = p.scope.regionId;
  return db().assignments.find((a) => a.roleKey === "REGIONAL_COORDINATOR" && a.status === "active" && a.scope.level === "region" && a.scope.regionId === regionId)?.memberId ?? null;
}

/** The project manager (for a chapter project, the chapter's Financial Secretary) sees its committees. */
function managesProject(actor: Actor, c: Committee) {
  const p = db().collections.find((x) => x.id === c.collectionId);
  if (!p) return false;
  return p.scope.level === "chapter" ? canAtExactly(actor, "RECORD_EXPENSE", p.scope) : projectManagerId(p) === actor.member.id;
}

/*
 * A committee is run by a post, not by the person who created it: the President
 * General for a national committee, the region's Regional Coordinator for a
 * regional one, the Chapter President for a chapter one — and their Vice
 * Presidents, who hold all their powers. When the post changes hands, the
 * committee goes with it.
 */
const sameScope = (a: Scope, b: Scope) => JSON.stringify(a) === JSON.stringify(b);

/** Does the actor hold the post that runs this committee? */
export function runsCommittee(actor: Actor, c: Committee) {
  return canAtExactly(actor, "CREATE_COMMITTEE", c.scope);
}

/** The people currently holding the post that runs this committee. */
function committeeHolders(c: Committee): ID[] {
  return [
    ...new Set(
      db()
        .assignments.filter((a) => a.status === "active" && sameScope(a.scope, c.scope) && roleByKey.get(a.roleKey)?.permissions.includes("CREATE_COMMITTEE"))
        .map((a) => a.memberId),
    ),
  ];
}

/** "President General", "Regional Coordinator of South-West", "President of Buea". */
export function committeePost(c: Committee) {
  return c.scope.level === "organization" ? "President General" : c.scope.level === "region" ? `Regional Coordinator of ${scopeLabel(c.scope)}` : `President of ${scopeLabel(c.scope)}`;
}

export function canSeeCommittee(actor: Actor, c: Committee) {
  return runsCommittee(actor, c) || overseesCommittee(actor, c) || wasMember(actor, c) || managesProject(actor, c);
}

/** "National", "South-West (regional)", "Buea (chapter)". */
export const committeeLevelLabel = (scope: Scope) =>
  scope.level === "organization" ? "National" : `${scopeLabel(scope)} (${scope.level === "region" ? "regional" : "chapter"})`;

/** Members the committee may draw from: anyone (national), the region's chapters (regional) or the chapter's members (chapter). */
function inCommitteeScope(c: Committee, memberId: ID) {
  if (c.scope.level === "organization") return true;
  const chapterId = currentChapterId(memberId);
  if (c.scope.level === "chapter") return chapterId === c.scope.chapterId;
  const regionId = c.scope.level === "region" ? c.scope.regionId : null;
  return !!chapterId && db().chapters.find((ch) => ch.id === chapterId)?.regionId === regionId;
}

/** Scopes in which the actor may create a committee (organisation for the President General, their region for a coordinator). */
export function committeeScopeOptions(actor: Actor) {
  return exactScopesWhere(actor, "CREATE_COMMITTEE").map((s) => ({
    value: s.level === "organization" ? "organization" : s.level === "region" ? `region:${s.regionId}` : `chapter:${s.chapterId}`,
    label: s.level === "organization" ? "National (whole organisation)" : committeeLevelLabel(s),
  }));
}

export function listCommittees(actor: Actor) {
  const d = db();
  return committees()
    .filter((c) => canSeeCommittee(actor, c))
    .map((c) => {
      const active = memberships().filter((m) => m.committeeId === c.id && m.endedAt === null);
      const mine = myMembership(actor, c);
      return {
        ...c,
        scopeLabel: committeeLevelLabel(c.scope),
        creatorName: memberName(c.createdBy),
        projectName: d.collections.find((x) => x.id === c.collectionId)?.name ?? "—",
        members: active.length,
        president: active.find((m) => m.position === "PRESIDENT") ? memberName(active.find((m) => m.position === "PRESIDENT")!.memberId) : null,
        myPlace: mine ? (mine.position ? POSITION_LABEL[mine.position] : "Member") : runsCommittee(actor, c) ? "In charge" : null,
      };
    })
    .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "active" ? -1 : 1));
}

/** Everything the committee page shows, limited to what the actor may see and do. */
export function getCommittee(actor: Actor, id: ID) {
  const d = db();
  const c = committees().find((x) => x.id === id);
  if (!c || !canSeeCommittee(actor, c)) return null;
  const mine = myMembership(actor, c);
  const isCreator = runsCommittee(actor, c); // holds the post that runs it
  const active = c.status === "active";
  const project = d.collections.find((x) => x.id === c.collectionId) ?? null;

  const rows = memberships().filter((m) => m.committeeId === c.id);
  const people = rows
    .map((m) => ({ ...m, name: memberName(m.memberId), chapterName: chapterName(currentChapterId(m.memberId)), positionLabel: m.position ? POSITION_LABEL[m.position] : "Member" }))
    // Current members first; within them, positions in order (President first), then ordinary members; then by name.
    .sort((a, b) => {
      const rank = (p: typeof a) => (p.endedAt === null ? 0 : 100) + (p.position ? POSITIONS.indexOf(p.position) : POSITIONS.length);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  const current = people.filter((p) => p.endedAt === null);
  const takenPositions = new Set(current.map((p) => p.position).filter(Boolean));

  // Project progress across the committee's scope (all ledgers).
  let progress = null as null | { expected: number; collected: number; outstanding: number; people: number };
  if (project) {
    const everyone = d.members.filter((m) => m.status === "active" && inCommitteeScope(c, m.id));
    let expected = 0;
    let collected = 0;
    let outstanding = 0;
    for (const m of everyone) {
      const exp = expectedFor(project, m.id);
      const paid = d.contributions.filter((x) => x.memberId === m.id && x.collectionId === project.id && x.type === "contribution" && x.status === "recorded").reduce((s, x) => s + x.amount, 0);
      expected += exp;
      collected += paid;
      outstanding += Math.max(0, exp - paid);
    }
    progress = { expected, collected, outstanding, people: everyone.length };
  }

  const funds = fundsCommittee(actor, c);
  const isManager = managesProject(actor, c);
  const seesBooks = isCreator || isManager || funds || overseesCommittee(actor, c) || (!!mine?.position && FINANCE_VIEWERS.includes(mine.position));
  const money = seesBooks ? committeeMoney(c) : null;

  return {
    ...committeeMeetingsAndDocuments(actor, c),
    messages: committeeMessages(actor, c),
    inCharge: { post: committeePost(c), people: committeeHolders(c).map((id) => ({ id, name: memberName(id) })) },
    managerId: project ? projectManagerId(project) : null,
    managerName: project && projectManagerId(project) ? memberName(projectManagerId(project)) : null,
    committee: { ...c, scopeLabel: committeeLevelLabel(c.scope), creatorName: memberName(c.createdBy), dissolvedByName: c.dissolvedBy ? memberName(c.dissolvedBy) : null },
    project,
    progress,
    current,
    past: people.filter((p) => p.endedAt !== null),
    myPosition: mine ? (mine.position ? POSITION_LABEL[mine.position] : "Member") : null,
    isCreator,
    canManage: isCreator && active,
    freePositions: POSITIONS.filter((p) => !takenPositions.has(p)).map((p) => ({ value: p, label: POSITION_LABEL[p] })),
    candidates: isCreator && active ? addCandidates(actor, c) : [],
    seesBooks,
    money,
    canDisburse: funds,
    canMessageCreator: active && leads(mine?.position) && !isCreator && committeeHolders(c).length > 0,
    canMessageCommittee: active && isCreator && current.some((p) => p.memberId !== actor.member.id),
  };
}

/** People the creator could add: active, in the committee's scope (or the creator), not on another active committee. */
function addCandidates(actor: Actor, c: Committee) {
  return db()
    .members.filter((m) => m.status === "active" && (m.id === actor.member.id || inCommitteeScope(c, m.id)))
    .map((m) => {
      const other = activeCommitteeOf(m.id);
      return {
        id: m.id,
        label: `${m.fullName} — ${chapterName(currentChapterId(m.id))}${other ? ` · on ${other.committee.name}` : ""}`,
        disabled: !!other,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function hasCommittees(actor: Actor) {
  return oversees(actor) || committees().some((c) => wasMember(actor, c) || managesProject(actor, c) || overseesCommittee(actor, c)) || exactScopesWhere(actor, "CREATE_COMMITTEE").length > 0;
}

/* ── Writing ───────────────────────────────────────────────────────── */

function parseScope(value: string): Scope | null {
  if (value === "organization") return { level: "organization" };
  const [level, id] = value.split(":");
  if (level === "region" && db().regions.some((r) => r.id === id)) return { level: "region", regionId: id };
  if (level === "chapter" && db().chapters.some((c) => c.id === id)) return { level: "chapter", chapterId: id };
  return null;
}

const auditScope = (c: { scope: Scope }) =>
  c.scope.level === "chapter" ? { chapterId: c.scope.chapterId } : { chapterId: null, regionId: c.scope.level === "region" ? c.scope.regionId : null };

export const committeeSchema = z.object({
  name: z.string().trim().min(3, "Give the committee a name.").max(120),
  scope: z.string().min(1, "Choose where the committee works."),
  collectionId: z.string().min(1, "Choose the project this committee carries out."),
});

const scopeValue = (s: Scope) => (s.level === "organization" ? "organization" : s.level === "region" ? `region:${s.regionId}` : `chapter:${s.chapterId}`);
const today = () => watToday();

/**
 * A project a committee may carry out: one set up beforehand (under Finances →
 * Collections) for exactly the committee's scope, that has not ended and is
 * not a registration renewal. Several committees may share a project (e.g.
 * phases or groups of it).
 */
function projectFits(collectionId: string, scope: Scope) {
  const d = db();
  const p = d.collections.find((x) => x.id === collectionId);
  if (!p || scopeValue(p.scope) !== scopeValue(scope)) return null;
  if ((d.renewals ?? []).some((r) => r.collectionId === p.id)) return null;
  if (p.endsOn && p.endsOn.slice(0, 10) < today()) return null;
  return p;
}

/** The projects the actor can attach to a new committee, grouped by committee scope value. */
export function committeeProjectOptions(actor: Actor) {
  return committeeScopeOptions(actor).flatMap((opt) => {
    const scope = parseScope(opt.value);
    if (!scope) return [];
    return db()
      .collections.filter((p) => projectFits(p.id, scope))
      .map((p) => ({
        value: p.id,
        scope: opt.value,
        label: p.name,
        description: p.description,
        executive: p.expected.executive,
        member: p.expected.member,
        startsOn: p.startsOn,
        endsOn: p.endsOn ?? null,
        committees: committees().filter((c) => c.collectionId === p.id && c.status === "active").length,
      }));
  });
}

/**
 * Creates a committee for a project that already exists — set up across the
 * whole organisation (President General) or the coordinator's region. Its
 * purpose, amounts and dates are the project's. The creator is not a member
 * unless they add themselves.
 */
export function createCommittee(actor: Actor, raw: unknown): CommandResult {
  if (actor.inactive) return fail(DENIED);
  const parsed = committeeSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const scope = parseScope(input.scope);
  if (!scope || !canAtExactly(actor, "CREATE_COMMITTEE", scope)) return fail(DENIED);
  const project = projectFits(input.collectionId, scope);
  if (!project) return fail("Choose a current project created for the committee's scope.", { collectionId: "Not available for this scope." });
  const d = db();
  if (committees().some((c) => c.name.toLowerCase() === input.name.toLowerCase())) return fail("A committee with this name already exists.", { name: "Already exists." });

  const now = new Date().toISOString();
  const id = newId("cm");
  d.committees ??= [];
  d.committees.push({ id, name: input.name, purpose: project.description, scope, collectionId: project.id, createdBy: actor.member.id, createdAt: now, status: "active" });
  recordAudit(actor, {
    action: "CREATE",
    entityType: "committee",
    entityId: id,
    ...auditScope({ scope }),
    summary: `Created committee “${input.name}” for project “${project.name}” (${committeeLevelLabel(scope).toLowerCase()})`,
    newValues: { name: input.name, project: project.name, scope },
  });
  return { ok: true, message: `“${input.name}” created.` };
}

const ownCommittee = (actor: Actor, committeeId: string) => {
  const c = committees().find((x) => x.id === committeeId);
  if (!c) return { error: fail("Committee not found.") } as const;
  if (!runsCommittee(actor, c) || actor.inactive) return { error: fail(`This committee is run by the ${committeePost(c)}.`) } as const;
  if (c.status !== "active") return { error: fail("This committee has been dissolved.") } as const;
  return { c } as const;
};

const positionSchema = z.union([z.literal(""), z.enum(["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "FINANCIAL_SECRETARY", "TREASURER"])]);

/** The creator adds someone to the committee, with or without a position. */
export function addCommitteeMember(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ committeeId: z.string().min(1), memberId: z.string().min(1, "Choose a member."), position: positionSchema.default("") }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const own = ownCommittee(actor, parsed.data.committeeId);
  if (own.error) return own.error;
  const c = own.c!;
  const member = db().members.find((m) => m.id === parsed.data.memberId && m.status === "active");
  if (!member) return fail("Member not found.", { memberId: "Choose a member." });
  if (member.id !== actor.member.id && !inCommitteeScope(c, member.id)) {
    return c.scope.level === "chapter"
      ? fail("A chapter committee takes its members from that chapter only.", { memberId: "Outside the chapter." })
      : fail("A regional committee takes its members from that region only.", { memberId: "Outside the region." });
  }
  const other = activeCommitteeOf(member.id);
  if (other) {
    return fail(`${member.fullName} is already on ${other.committee.name}.`, { memberId: "Already on a committee." });
  }
  const position = parsed.data.position || null;
  if (position && memberships().some((m) => m.committeeId === c.id && m.endedAt === null && m.position === position)) {
    return fail(`This committee already has a ${POSITION_LABEL[position]}.`, { position: "Already taken." });
  }
  const d = db();
  d.committeeMembers ??= [];
  const id = newId("cmm");
  d.committeeMembers.push({ id, committeeId: c.id, memberId: member.id, position, addedBy: actor.member.id, addedAt: new Date().toISOString(), endedAt: null });
  recordAudit(actor, {
    action: "ASSIGN_ROLE",
    entityType: "committee_member",
    entityId: id,
    ...auditScope(c),
    summary: `Added ${member.fullName} to committee “${c.name}”${position ? ` as ${POSITION_LABEL[position]}` : ""}`,
    newValues: { committee: c.id, member: member.id, position },
  });
  return { ok: true, message: `${member.fullName} is now ${position ? `the committee's ${POSITION_LABEL[position]}` : "a member of the committee"}.` };
}

/** The creator changes someone's position on the committee (or makes them an ordinary member). */
export function setCommitteePosition(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ membershipId: z.string().min(1), position: positionSchema.default("") }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const m = memberships().find((x) => x.id === parsed.data.membershipId && x.endedAt === null);
  if (!m) return fail("That committee member was not found.");
  const own = ownCommittee(actor, m.committeeId);
  if (own.error) return own.error;
  const position = parsed.data.position || null;
  if (position && memberships().some((x) => x.committeeId === m.committeeId && x.endedAt === null && x.position === position && x.id !== m.id)) {
    return fail(`This committee already has a ${POSITION_LABEL[position]}.`, { position: "Already taken." });
  }
  const old = m.position;
  m.position = position;
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "committee_member",
    entityId: m.id,
    ...auditScope(own.c!),
    summary: `${memberName(m.memberId)} is now ${position ? POSITION_LABEL[position] : "an ordinary member"} of “${own.c!.name}”`,
    oldValues: { position: old },
    newValues: { position },
  });
  return { ok: true, message: `${memberName(m.memberId)} is now ${position ? `the ${POSITION_LABEL[position]}` : "an ordinary member"}.` };
}

/** The creator takes someone off the committee (kept in its history). */
export function removeCommitteeMember(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ membershipId: z.string().min(1), reason: z.string().trim().min(3, "Give a reason.").max(300) }).safeParse(raw);
  if (!parsed.success) return fail("A reason is required.", fieldErrorsFrom(parsed.error));
  const m = memberships().find((x) => x.id === parsed.data.membershipId && x.endedAt === null);
  if (!m) return fail("That committee member was not found.");
  const own = ownCommittee(actor, m.committeeId);
  if (own.error) return own.error;
  m.endedAt = new Date().toISOString();
  m.endedBy = actor.member.id;
  m.endReason = parsed.data.reason;
  recordAudit(actor, {
    action: "REMOVE_ROLE",
    entityType: "committee_member",
    entityId: m.id,
    ...auditScope(own.c!),
    summary: `Removed ${memberName(m.memberId)} from committee “${own.c!.name}”`,
    reason: parsed.data.reason,
  });
  return { ok: true, message: `${memberName(m.memberId)} is no longer on the committee.` };
}

/** The creator dissolves the committee once its purpose is served (reason required). Members are freed; history is kept. */
export function dissolveCommittee(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ committeeId: z.string().min(1), reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500) }).safeParse(raw);
  if (!parsed.success) return fail("A reason is required to dissolve the committee.", fieldErrorsFrom(parsed.error));
  const own = ownCommittee(actor, parsed.data.committeeId);
  if (own.error) return own.error;
  const c = own.c!;
  const now = new Date().toISOString();
  c.status = "dissolved";
  c.dissolvedBy = actor.member.id;
  c.dissolvedAt = now;
  c.dissolveReason = parsed.data.reason;
  for (const m of memberships()) {
    if (m.committeeId === c.id && m.endedAt === null) {
      m.endedAt = now;
      m.endedBy = actor.member.id;
      m.endReason = "Committee dissolved";
    }
  }
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "committee",
    entityId: c.id,
    ...auditScope(c),
    summary: `Dissolved committee “${c.name}”`,
    oldValues: { status: "active" },
    newValues: { status: "dissolved" },
    reason: parsed.data.reason,
  });
  return { ok: true, message: `“${c.name}” has been dissolved. Its members are free to join other committees; its records are kept.` };
}

/**
 * Committee messages, with attachments: the committee President writes to the
 * post that runs the committee; that post writes to the whole committee.
 */
export function sendCommitteeMessage(actor: Actor, raw: unknown, files: IncomingFile[] = []): CommandResult {
  const parsed = z
    .object({
      committeeId: z.string().min(1),
      to: z.enum(["creator", "committee"]),
      title: z.string().trim().min(3, "Add a subject.").max(140),
      body: z.string().trim().min(5, "Write your message.").max(4000),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const c = committees().find((x) => x.id === input.committeeId);
  if (!c || c.status !== "active" || actor.inactive) return fail(DENIED);
  const mine = myMembership(actor, c);
  let recipients: ID[];
  if (input.to === "creator") {
    if (!leads(mine?.position)) return fail(`Only the committee's President or Vice President writes to the ${committeePost(c)}.`);
    recipients = committeeHolders(c);
  } else {
    if (!runsCommittee(actor, c)) return fail(`Only the ${committeePost(c)} writes to the whole committee.`);
    recipients = memberships().filter((m) => m.committeeId === c.id && m.endedAt === null).map((m) => m.memberId);
  }
  recipients = recipients.filter((id) => id !== actor.member.id);
  if (recipients.length === 0) return fail("There is nobody to send this to yet.");
  if (files.length > MAX_ATTACHMENTS) return fail(`Attach at most ${MAX_ATTACHMENTS} files.`, { attachments: "Too many files." });
  for (const f of files) {
    const problem = checkFile(f);
    if (problem) return fail(problem, { attachments: problem });
  }
  const attachmentIds = files.map((f) => storeDocument(actor, f, { title: f.name, category: "other", scope: c.scope, roleKeys: [], attachment: true }));
  const now = new Date().toISOString();
  for (const memberId of recipients) {
    db().notifications.push({
      id: newId("nt"),
      type: "message",
      title: `[${c.name}] ${input.title}`,
      body: input.body,
      audience: { kind: "member", memberId },
      attachmentIds: attachmentIds.length ? attachmentIds : undefined,
      committeeId: c.id,
      createdBy: actor.member.id,
      createdAt: now,
    });
  }
  recordAudit(actor, {
    action: "CREATE",
    entityType: "notification",
    entityId: c.id,
    ...auditScope(c),
    summary: `Committee message “${input.title}” to ${input.to === "creator" ? "the committee's creator" : `the committee (${recipients.length})`}${attachmentIds.length ? ` with ${attachmentIds.length} attachment${attachmentIds.length === 1 ? "" : "s"}` : ""}`,
  });
  return { ok: true, message: input.to === "creator" ? `Sent to the ${committeePost(c)} (${recipients.map(memberName).join(", ")}).` : `Sent to ${recipients.length} committee member${recipients.length === 1 ? "" : "s"}.` };
}

/* ── Project money: chapter → project manager (who created the project) → committee ── */

/*
 * Members pay project contributions to their chapter's Financial Secretary.
 * The chapter sends that money to the creator of the project's committees
 * (the President General for national projects, the Regional Coordinator for
 * regional ones), recorded as a chapter expense. The creator then disburses
 * it to the project's committees. Committees do not account for what they
 * spend: what matters is the result.
 */

/**
 * Who receives a project's money from the chapters: its project manager — the
 * National Financial Secretary or the region's Regional Coordinator in office.
 * A chapter project's money stays in the chapter.
 */
export function projectRecipient(collectionId: ID) {
  const p = db().collections.find((x) => x.id === collectionId);
  return p ? projectManagerId(p) : null;
}

/** Projects a chapter can send money for: current national projects and its region's, with or without committees. */
export function sendableProjects(chapterId: ID) {
  const d = db();
  const regionId = d.chapters.find((c) => c.id === chapterId)?.regionId ?? null;
  return d.collections
    .filter((p) => (p.scope.level === "organization" || (p.scope.level === "region" && p.scope.regionId === regionId)) && projectFits(p.id, p.scope))
    .flatMap((p) => {
      const to = projectRecipient(p.id);
      if (!to) return [];
      const collected = d.contributions
        .filter((x) => x.collectionId === p.id && x.chapterId === chapterId && x.ledger === "chapter" && x.type === "contribution" && x.status === "recorded")
        .reduce((s, x) => s + x.amount, 0);
      const sent = d.expenses
        .filter((e) => e.sentFor?.collectionId === p.id && e.scope.level === "chapter" && e.scope.chapterId === chapterId && e.status === "recorded")
        .reduce((s, e) => s + e.amount, 0);
      return [{ value: p.id, label: p.name, recipientId: to, recipientName: memberName(to), collected, sent }];
    });
}

export const sendProjectMoneySchema = z.object({
  scope: z.string().min(1, "Choose the chapter."),
  sendFor: z.string().min(1, "Choose the project."),
  amount: francs("Enter the amount sent").refine((n) => n > 0, "Must be greater than zero."),
  spentOn: z.iso.date("Enter the date sent."),
});

/** A chapter Financial Secretary records project money sent to the committee creator (a chapter expense). */
export function sendProjectMoney(actor: Actor, raw: unknown): CommandResult {
  const parsed = sendProjectMoneySchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const [level, chapterId] = input.scope.split(":");
  if (level !== "chapter" || !db().chapters.some((c) => c.id === chapterId)) return fail("Project money is sent from a chapter's funds.", { scope: "Choose a chapter." });
  const scope: Scope = { level: "chapter", chapterId };
  if (!canAtExactly(actor, "RECORD_EXPENSE", scope)) return fail(DENIED);
  if (input.spentOn > today()) return fail("The date cannot be in the future.", { spentOn: "Date is in the future." });
  const option = sendableProjects(scope.chapterId).find((o) => o.value === input.sendFor);
  if (!option) return fail("Choose a current national or regional project.", { sendFor: "Not available." });
  // A chapter sends only what it has collected for the project (and not already sent).
  const available = option.collected - option.sent;
  if (input.amount > available)
    return fail(
      available > 0 ? `The chapter has ${formatMoney(available)} collected for this project that it has not yet sent.` : "The chapter has nothing collected for this project that it has not already sent.",
      { amount: `At most ${formatMoney(Math.max(0, available))}.` },
    );
  const project = db().collections.find((p) => p.id === option.value)!;
  const id = newId("ex");
  const reference = nextReference("PV");
  const description = `Sent for “${project.name}”`;
  db().expenses.push({
    id,
    scope,
    description,
    paidTo: option.recipientName,
    sentFor: { collectionId: project.id, toMemberId: option.recipientId },
    amount: input.amount,
    currency: "XAF",
    spentOn: `${input.spentOn}T12:00:00Z`,
    reference,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: new Date().toISOString(),
  });
  sendProjectMoneyReceipt(db().expenses.at(-1)!);
  recordAudit(actor, {
    action: "CREATE",
    entityType: "expense",
    entityId: id,
    chapterId: scope.chapterId,
    summary: `Sent ${formatMoney(input.amount)} to ${option.recipientName} for project “${project.name}” (${scopeLabel(scope)}) — ${reference}`,
    newValues: { amount: input.amount, project: project.name, to: option.recipientName, reference },
  });
  return { ok: true, message: `Sent ${formatMoney(input.amount)}. Voucher ${reference}.` };
}

/**
 * A project's money: what its project manager has received from the chapters
 * (for a chapter project: what the chapter collected), what has been given to
 * its committees, and what is still held.
 */
function projectPurse(collectionId: ID) {
  const d = db();
  const p = d.collections.find((x) => x.id === collectionId);
  if (!p) return { received: 0, disbursed: 0, held: 0 };
  const received =
    p.scope.level === "chapter"
      ? d.contributions
          .filter((x) => x.collectionId === p.id && x.ledger === "chapter" && x.chapterId === (p.scope as { chapterId: ID }).chapterId && x.type === "contribution" && x.status === "recorded")
          .reduce((s, x) => s + x.amount, 0)
      : d.expenses.filter((e) => e.sentFor?.collectionId === p.id && e.status === "recorded").reduce((s, e) => s + e.amount, 0);
  const ids = new Set(committees().filter((c) => c.collectionId === p.id).map((c) => c.id));
  const disbursed = d.expenses.filter((e) => e.committeeId && ids.has(e.committeeId) && e.status === "recorded").reduce((s, e) => s + e.amount, 0);
  return { received, disbursed, held: received - disbursed };
}

/** The committee's money: received for its project, given to it, and still held by the project manager. */
function committeeMoney(c: Committee) {
  const d = db();
  const project = projectOf(c);
  const purse = projectPurse(c.collectionId);
  const sends = d.expenses
    .filter((e) => e.sentFor?.collectionId === c.collectionId)
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn))
    .map((e) => ({ id: e.id, on: e.spentOn, chapterName: e.scope.level === "chapter" ? chapterName(e.scope.chapterId) : "—", amount: e.amount, reference: e.reference, status: e.status, voidReason: e.voidReason }));
  const disbursements = d.expenses
    .filter((e) => e.committeeId === c.id)
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn))
    .map((e) => ({ id: e.id, on: e.spentOn, note: e.description, amount: e.amount, reference: e.reference, status: e.status, voidReason: e.voidReason }));
  const toThis = disbursements.filter((x) => x.status === "recorded").reduce((s, x) => s + x.amount, 0);
  return { ...purse, toThis, sends, disbursements, chapterProject: project?.scope.level === "chapter" };
}

export const disbursementSchema = z.object({
  committeeId: z.string().min(1),
  amount: francs("Enter the amount given").refine((n) => n > 0, "Must be greater than zero."),
  paidOn: z.iso.date("Enter the date given."),
  note: z.string().trim().max(200).optional().default(""),
});

/** The project a committee carries out. */
const projectOf = (c: Committee) => db().collections.find((p) => p.id === c.collectionId) ?? null;

/**
 * Who gives a committee its money: the project manager (who created the
 * project) — or, for a chapter project, whose money stays in the chapter's
 * funds, the chapter's Financial Secretary.
 */
function fundsCommittee(actor: Actor, c: Committee) {
  const p = projectOf(c);
  if (!p || actor.inactive || c.status !== "active") return false;
  if (p.scope.level === "chapter") return canAtExactly(actor, "RECORD_EXPENSE", p.scope);
  return projectManagerId(p) === actor.member.id;
}

/** Who receives the committee's money on its behalf: its Financial Secretary, otherwise its President, Vice President or Treasurer. */
function committeeMoneyKeeper(c: Committee) {
  const current = memberships().filter((m) => m.committeeId === c.id && m.endedAt === null);
  for (const pos of ["FINANCIAL_SECRETARY", "PRESIDENT", "VICE_PRESIDENT", "TREASURER"] as const) {
    const holder = current.find((m) => m.position === pos);
    if (holder) return { memberId: holder.memberId, position: POSITION_LABEL[pos] };
  }
  return null;
}

/** The committee's receipt for money its project manager gave it (or the notice that the record was cancelled). */
function committeeReceipt(c: Committee, e: Expense) {
  const keeper = committeeMoneyKeeper(c);
  if (!keeper) return;
  const voided = e.status === "voided";
  db().notifications.push({
    id: newId("nt"),
    type: "receipt",
    title: voided ? `Cancelled: receipt ${e.reference}` : `Receipt ${e.reference} · ${c.name}`,
    body: voided
      ? `The record of ${formatMoney(e.amount)} given to “${c.name}” (${e.reference}) was cancelled by ${memberName(e.voidedBy)}. Reason: ${e.voidReason}.`
      : `Received ${formatMoney(e.amount)} for “${c.name}” on ${formatDate(e.spentOn)} from ${memberName(e.recordedBy)} (${postAt(e.recordedBy, e.recordedAt)}). Sent to you as the committee's ${keeper.position}. Keep the voucher number ${e.reference} for your records.`,
    audience: { kind: "member", memberId: keeper.memberId },
    link: `/dashboard/committees/${c.id}`,
    createdBy: voided ? (e.voidedBy ?? e.recordedBy) : e.recordedBy,
    createdAt: new Date().toISOString(),
  });
}

/** The committee's creator records money given to the committee from what the chapters sent for its project. */
export function recordDisbursement(actor: Actor, raw: unknown): CommandResult {
  const parsed = disbursementSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const c = committees().find((x) => x.id === input.committeeId);
  if (!c) return fail("Committee not found.");
  if (c.status !== "active") return fail("This committee has been dissolved.");
  if (!fundsCommittee(actor, c)) return fail("Only the project manager gives the committee money.");
  if (input.paidOn > today()) return fail("The date cannot be in the future.", { paidOn: "Date is in the future." });
  const project = projectOf(c)!;
  const { held } = projectPurse(c.collectionId);
  if (input.amount > held)
    return fail(
      held > 0
        ? `There is ${formatMoney(held)} for this project not yet given to its committees, so you can give at most that.`
        : project.scope.level === "chapter"
          ? "Nothing has been collected for this project yet (or it has all been given out)."
          : "Nothing has been received for this project yet: chapters send its money to you first.",
      { amount: `At most ${formatMoney(held)}.` },
    );
  const id = newId("ex");
  const reference = nextReference("PV");
  db().expenses.push({
    id,
    // A chapter project's money is the chapter's: giving it to the committee is a chapter expense.
    scope: project.scope.level === "chapter" ? project.scope : c.scope,
    committeeId: c.id,
    description: input.note || `Disbursed to “${c.name}”`,
    paidTo: c.name,
    amount: input.amount,
    currency: "XAF",
    spentOn: `${input.paidOn}T12:00:00Z`,
    reference,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: new Date().toISOString(),
  });
  committeeReceipt(c, db().expenses.at(-1)!);
  recordAudit(actor, {
    action: "CREATE",
    entityType: "expense",
    entityId: id,
    ...auditScope(c),
    summary: `Disbursed ${formatMoney(input.amount)} to committee “${c.name}” — ${reference}`,
    newValues: { amount: input.amount, committee: c.name, reference },
  });
  return { ok: true, message: `Recorded ${formatMoney(input.amount)} given to “${c.name}”. Voucher ${reference}.` };
}

/** The creator voids a disbursement they recorded (with a reason); it stays in the history. */
export function voidCommitteeRecord(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ id: z.string().min(1), reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300) }).safeParse(raw);
  if (!parsed.success) return fail("Give a reason.", fieldErrorsFrom(parsed.error));
  const record = db().expenses.find((x) => x.id === parsed.data.id && x.committeeId);
  if (!record) return fail("Record not found.");
  const committee = committees().find((x) => x.id === record.committeeId)!;
  if (!fundsCommittee(actor, committee)) return fail("Only the project manager can cancel this.");
  if (record.status === "voided") return fail("Already cancelled.");
  record.status = "voided";
  record.voidedBy = actor.member.id;
  record.voidedAt = new Date().toISOString();
  record.voidReason = parsed.data.reason;
  committeeReceipt(committee, record);
  recordAudit(actor, {
    action: "VOID",
    entityType: "expense",
    entityId: record.id,
    ...auditScope(committee),
    summary: `Cancelled disbursement ${record.reference} of ${formatMoney(record.amount)}`,
    oldValues: { status: "recorded" },
    newValues: { status: "voided" },
    reason: parsed.data.reason,
  });
  return { ok: true, message: "Cancelled." };
}

export type CommitteeMembershipRow = CommitteeMembership & { name: string; chapterName: string; positionLabel: string };

/* ── Messages, meetings, minutes and documents ─────────────────────── */

/**
 * The committee's messages the actor sent or received, newest first, each
 * with its attachments. Attachments stay with their message: they are not
 * listed among the committee's documents.
 */
export function committeeMessages(actor: Actor, c: Committee) {
  const me = actor.member.id;
  const seen = new Map<string, { id: ID; title: string; body: string; from: string; to: string; sentAt: string; attachments: ReturnType<typeof attachmentsFor> }>();
  const mine = db().notifications.filter((n) => n.committeeId === c.id && (n.createdBy === me || (n.audience.kind === "member" && n.audience.memberId === me)));
  for (const n of mine) {
    // One message to the whole committee is stored once per recipient.
    const key = `${n.createdBy}|${n.createdAt}|${n.title}`;
    // To whoever ran the committee at the time: not one of its members.
    const toCreator = n.audience.kind === "member" && !memberships().some((m) => m.committeeId === c.id && m.memberId === (n.audience as { memberId: ID }).memberId);
    const sentToMe = n.audience.kind === "member" && n.audience.memberId === me;
    if (seen.has(key) && !sentToMe) continue;
    seen.set(key, {
      id: n.id,
      title: n.title.replace(`[${c.name}] `, ""),
      body: n.body,
      from: n.createdBy ? memberName(n.createdBy) : "NCUDA",
      to: toCreator ? `The ${committeePost(c)}` : "The committee",
      sentAt: n.createdAt,
      attachments: attachmentsFor(actor, n),
    });
  }
  return [...seen.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/*
 * Mirrors a chapter's EXCO: the President and Secretary schedule meetings;
 * the President, Vice President and Secretary record attendance and mark a
 * meeting held or cancelled; the Secretary writes and publishes the minutes;
 * the President, Secretary and Financial Secretary upload documents. Everyone
 * who can see the committee reads published minutes and its documents.
 */
const SCHEDULERS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY"];
const MEETING_OFFICERS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY"];
const UPLOADERS: CommitteePosition[] = ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "FINANCIAL_SECRETARY"];

const committeeMeetings = () => db().committeeMeetings ?? [];

/** My position on this active committee (null if none), while I am active. */
function positionIn(actor: Actor, c: Committee) {
  if (actor.inactive || c.status !== "active") return null;
  return myMembership(actor, c)?.position ?? null;
}

/** The committee's meetings and documents, as the actor may see them. */
export function committeeMeetingsAndDocuments(actor: Actor, c: Committee) {
  const pos = positionIn(actor, c);
  const meetings = committeeMeetings()
    .filter((m) => m.committeeId === c.id)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.startsAt,
      location: m.location,
      status: m.status,
      minutes: m.minutes?.status === "published" ? ("published" as const) : m.minutes ? ("draft" as const) : ("none" as const),
    }));
  const documents = db()
    .documents.filter((doc) => doc.committeeId === c.id)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
      uploadedByName: memberName(doc.uploadedBy),
      meetingTitle: doc.committeeMeetingId ? (committeeMeetings().find((m) => m.id === doc.committeeMeetingId)?.title ?? null) : null,
    }));
  return {
    meetings,
    documents,
    meetingOptions: meetings.filter((m) => m.status !== "cancelled").map((m) => ({ id: m.id, title: m.title })),
    canSchedule: !!pos && SCHEDULERS.includes(pos),
    canUpload: !!pos && UPLOADERS.includes(pos),
  };
}

/** One committee meeting: details, attendance and minutes (drafts only for the Secretary, President and Vice President). */
export function getCommitteeMeeting(actor: Actor, committeeId: ID, meetingId: ID) {
  const c = committees().find((x) => x.id === committeeId);
  const m = committeeMeetings().find((x) => x.id === meetingId && x.committeeId === committeeId);
  if (!c || !m || !canSeeCommittee(actor, c)) return null;
  const pos = positionIn(actor, c);
  const seesDraft = pos === "SECRETARY" || leads(pos);
  const roll = memberships()
    .filter((x) => x.committeeId === c.id && (x.endedAt === null || m.attendance.some((a) => a.memberId === x.memberId)))
    .filter((x, i, all) => all.findIndex((y) => y.memberId === x.memberId) === i)
    .map((x) => ({ id: x.memberId, fullName: memberName(x.memberId), status: m.attendance.find((a) => a.memberId === x.memberId)?.status ?? null }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const documents = db()
    .documents.filter((doc) => doc.committeeMeetingId === m.id)
    .map((doc) => ({ id: doc.id, title: doc.title, filename: doc.filename, sizeBytes: doc.sizeBytes, uploadedAt: doc.uploadedAt, uploadedBy: doc.uploadedBy, uploadedByName: memberName(doc.uploadedBy) }));
  return {
    committee: { id: c.id, name: c.name, status: c.status },
    meeting: { id: m.id, title: m.title, startsAt: m.startsAt, location: m.location, agenda: m.agenda, status: m.status, createdBy: m.createdBy, createdByName: memberName(m.createdBy) },
    minutes: m.minutes && (m.minutes.status === "published" || seesDraft) ? { ...m.minutes, recordedByName: memberName(m.minutes.recordedBy) } : null,
    roll,
    documents,
    canRecordAttendance: !!pos && MEETING_OFFICERS.includes(pos) && m.status !== "cancelled",
    canChangeStatus: !!pos && MEETING_OFFICERS.includes(pos) && m.status === "scheduled",
    canWriteMinutes: pos === "SECRETARY" && m.status !== "cancelled" && m.minutes?.status !== "published",
    canUpload: !!pos && UPLOADERS.includes(pos) && m.status !== "cancelled",
  };
}

/** A committee document the actor may download (the download route falls back to this). */
export function committeeDocumentForDownload(actor: Actor, id: ID) {
  const doc = db().documents.find((x) => x.id === id && x.committeeId);
  if (!doc) return null;
  const c = committees().find((x) => x.id === doc.committeeId);
  return c && canSeeCommittee(actor, c) ? doc : null;
}

/** Tells the committee's current members (except the actor) about something new. */
function notifyCommittee(actor: Actor, c: Committee, title: string, body: string, link: string) {
  const now = new Date().toISOString();
  for (const m of memberships().filter((x) => x.committeeId === c.id && x.endedAt === null && x.memberId !== actor.member.id)) {
    db().notifications.push({ id: newId("nt"), type: "announcement", title: `[${c.name}] ${title}`, body, audience: { kind: "member", memberId: m.memberId }, link, createdBy: actor.member.id, createdAt: now });
  }
}

const activeCommittee = (committeeId: string) => {
  const c = committees().find((x) => x.id === committeeId);
  if (!c) return { error: fail("Committee not found.") } as const;
  if (c.status !== "active") return { error: fail("This committee has been dissolved.") } as const;
  return { c } as const;
};

export const committeeMeetingSchema = z.object({
  committeeId: z.string().min(1),
  title: z.string().trim().min(3, "Give the meeting a title.").max(160),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter the date and time."),
  location: z.string().trim().min(2, "Enter where it takes place.").max(200),
  agenda: z.string().trim().max(2000).optional().default(""),
});

/** The committee's President or Secretary schedules a meeting; members are told. */
export function scheduleCommitteeMeeting(actor: Actor, raw: unknown): CommandResult {
  const parsed = committeeMeetingSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const found = activeCommittee(input.committeeId);
  if (found.error) return found.error;
  const c = found.c!;
  const pos = positionIn(actor, c);
  if (!pos || !SCHEDULERS.includes(pos)) return fail("Meetings are scheduled by the committee's President, Vice President or Secretary.");
  const id = newId("cmt");
  // The time is entered in West Africa Time (UTC+1).
  const startsAt = new Date(`${input.startsAt.slice(0, 16)}:00+01:00`).toISOString();
  db().committeeMeetings ??= [];
  db().committeeMeetings!.push({
    id,
    committeeId: c.id,
    title: input.title,
    startsAt,
    location: input.location,
    agenda: input.agenda.split("\n").map((l) => l.trim()).filter(Boolean),
    status: "scheduled",
    createdBy: actor.member.id,
    createdAt: new Date().toISOString(),
    attendance: [],
  });
  recordAudit(actor, { action: "CREATE", entityType: "committee_meeting", entityId: id, ...auditScope(c), summary: `Scheduled “${input.title}” for committee “${c.name}”` });
  notifyCommittee(actor, c, `Meeting: ${input.title}`, `${input.location}. Open the meeting for the agenda.`, `/dashboard/committees/${c.id}/meetings/${id}`);
  return { ok: true, message: `“${input.title}” is scheduled. The committee's members have been told.` };
}

/** The President, Vice President or Secretary marks a meeting held or cancelled. */
export function setCommitteeMeetingStatus(actor: Actor, raw: unknown): CommandResult {
  const parsed = z.object({ meetingId: z.string().min(1), status: z.enum(["held", "cancelled"]) }).safeParse(raw);
  if (!parsed.success) return fail("Choose held or cancelled.");
  const m = committeeMeetings().find((x) => x.id === parsed.data.meetingId);
  if (!m) return fail("Meeting not found.");
  const found = activeCommittee(m.committeeId);
  if (found.error) return found.error;
  const pos = positionIn(actor, found.c!);
  if (!pos || !MEETING_OFFICERS.includes(pos)) return fail(DENIED);
  if (m.status !== "scheduled") return fail("This meeting is already marked held or cancelled.");
  m.status = parsed.data.status;
  recordAudit(actor, { action: "UPDATE", entityType: "committee_meeting", entityId: m.id, ...auditScope(found.c!), summary: `Marked “${m.title}” ${m.status}`, oldValues: { status: "scheduled" }, newValues: { status: m.status } });
  return { ok: true, message: `“${m.title}” is marked ${m.status}.` };
}

/** The President, Vice President or Secretary records attendance for the committee's current members. */
export function recordCommitteeAttendance(actor: Actor, meetingId: string, entries: Record<string, string>): CommandResult {
  const m = committeeMeetings().find((x) => x.id === meetingId);
  if (!m) return fail("Meeting not found.");
  const found = activeCommittee(m.committeeId);
  if (found.error) return found.error;
  const pos = positionIn(actor, found.c!);
  if (!pos || !MEETING_OFFICERS.includes(pos)) return fail(DENIED);
  if (m.status === "cancelled") return fail("This meeting was cancelled.");
  const onCommittee = new Set(memberships().filter((x) => x.committeeId === m.committeeId && x.endedAt === null).map((x) => x.memberId));
  const valid: AttendanceStatus[] = ["present", "late", "excused", "absent"];
  const now = new Date().toISOString();
  let n = 0;
  for (const [memberId, status] of Object.entries(entries)) {
    if (!onCommittee.has(memberId) || !valid.includes(status as AttendanceStatus)) continue;
    const entry = { memberId, status: status as AttendanceStatus, recordedBy: actor.member.id, recordedAt: now };
    const i = m.attendance.findIndex((a) => a.memberId === memberId);
    if (i >= 0) m.attendance[i] = entry;
    else m.attendance.push(entry);
    n++;
  }
  if (n === 0) return fail("Choose an attendance status for at least one member.");
  recordAudit(actor, { action: "UPDATE", entityType: "committee_attendance", entityId: m.id, ...auditScope(found.c!), summary: `Recorded attendance for “${m.title}” (${n})` });
  return { ok: true, message: `Attendance saved for ${n} member${n === 1 ? "" : "s"}.` };
}

/** The committee's Secretary writes the minutes; publishing shares them with the committee (then they are final). */
export function saveCommitteeMinutes(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({
      meetingId: z.string().min(1),
      text: z.string().trim().min(10, "Write the minutes (at least a sentence or two).").max(20000),
      decisions: z.string().trim().max(4000).optional().default(""),
      publish: z.string().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const m = committeeMeetings().find((x) => x.id === parsed.data.meetingId);
  if (!m) return fail("Meeting not found.");
  const found = activeCommittee(m.committeeId);
  if (found.error) return found.error;
  const c = found.c!;
  if (positionIn(actor, c) !== "SECRETARY") return fail("Minutes are written by the committee's Secretary.");
  if (m.status === "cancelled") return fail("This meeting was cancelled.");
  if (m.minutes?.status === "published") return fail("These minutes are published and can no longer be changed.");
  const now = new Date().toISOString();
  const publish = parsed.data.publish === "on";
  m.minutes = {
    text: parsed.data.text,
    decisions: parsed.data.decisions.split("\n").map((l) => l.trim()).filter(Boolean),
    status: publish ? "published" : "draft",
    recordedBy: actor.member.id,
    updatedAt: now,
    publishedAt: publish ? now : undefined,
  };
  recordAudit(actor, { action: publish ? "APPROVE" : "UPDATE", entityType: "committee_minutes", entityId: m.id, ...auditScope(c), summary: `${publish ? "Published" : "Saved draft"} minutes of “${m.title}”` });
  if (publish) notifyCommittee(actor, c, `Minutes published: ${m.title}`, "The minutes are now available on the meeting page.", `/dashboard/committees/${c.id}/meetings/${m.id}`);
  return { ok: true, message: publish ? "The minutes are published and the committee has been told." : "Draft saved. Only you and the committee's President and Vice President can see it until you publish." };
}

/** The committee's President, Secretary or Financial Secretary uploads a document (optionally for a meeting). */
export function uploadCommitteeDocument(actor: Actor, raw: unknown, file: IncomingFile | undefined): CommandResult {
  const parsed = z
    .object({
      committeeId: z.string().min(1),
      title: z.string().trim().min(3, "Give the document a title.").max(160),
      meetingId: z.string().optional().default(""),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const found = activeCommittee(input.committeeId);
  if (found.error) return found.error;
  const c = found.c!;
  const pos = positionIn(actor, c);
  if (!pos || !UPLOADERS.includes(pos)) return fail("Not allowed for your position.");
  if (!file) return fail("Choose a file to upload.", { file: "Choose a file." });
  const problem = checkFile(file);
  if (problem) return fail(problem, { file: problem });
  const meeting = input.meetingId ? committeeMeetings().find((m) => m.id === input.meetingId && m.committeeId === c.id) : undefined;
  if (input.meetingId && !meeting) return fail("Meeting not found.", { meetingId: "Not found." });
  const id = storeDocument(actor, file, { title: input.title, category: meeting ? "minutes" : "other", scope: c.scope, roleKeys: [], attachment: false });
  const doc = db().documents.find((x) => x.id === id)!;
  doc.committeeId = c.id;
  doc.committeeMeetingId = meeting?.id;
  notifyCommittee(actor, c, `New document: ${input.title}`, "A document has been shared with the committee.", meeting ? `/dashboard/committees/${c.id}/meetings/${meeting.id}` : `/dashboard/committees/${c.id}`);
  return { ok: true, message: `“${input.title}” was shared with the committee.` };
}
