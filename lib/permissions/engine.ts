/**
 * Authorization engine — pure functions, no I/O.
 *
 *   Authentication  → who is this?               (lib/auth)
 *   Role            → what office do they hold?  (role_assignments)
 *   Permission      → what may that office do?   (role_permissions)
 *   Scope           → where may they do it?      (organisation / region / chapter)
 *
 * The same rules are enforced in the database by `public.has_permission()`
 * and Row Level Security. This TypeScript copy lets the server render the
 * right UI and reject bad requests early. It is NOT the security boundary on
 * its own, and nothing in the browser is.
 */
import type {
  AuthorityDelegation,
  Chapter,
  ID,
  Member,
  RoleAssignment,
  RoleDefinition,
  Scope,
} from "@/lib/domain/types";
import type { Permission } from "./catalog";
import { MEMBER_BASELINE, roleByKey } from "./roles";

export type GrantSource =
  | { kind: "baseline" }
  | { kind: "role"; roleKey: string; assignmentId: ID }
  | { kind: "delegation"; delegationId: ID; grantedBy: ID };

export interface Grant {
  permission: Permission;
  scope: Scope;
  source: GrantSource;
}

export interface Actor {
  member: Member;
  /** The member's chapter — null for someone not yet in a chapter (e.g. a newly appointed Regional Coordinator). */
  chapterId: ID | null;
  regionId: ID | null;
  /** Active role assignments with their definitions. */
  roles: Array<{ assignment: RoleAssignment; role: RoleDefinition }>;
  grants: Grant[];
  /**
   * Set while a registration renewal is open and this member has not paid
   * for the year: they can sign in, but their offices' powers are suspended
   * (only recording registration payments remains, for Financial Secretaries).
   */
  inactive?: { year: number; chapterId: ID | null } | null;
  /**
   * Not in a chapter while a chapter they could join exists: they may only
   * join one (see buildActor). Everyone must belong to a chapter.
   */
  mustJoinChapter?: boolean;
}

/** What an action is aimed at. */
export type Target = { chapterId: ID } | { regionId: ID } | { organization: true };

export interface OrgStructure {
  chapters: Chapter[];
}

export function scopeToTarget(scope: Scope): Target {
  if (scope.level === "chapter") return { chapterId: scope.chapterId };
  if (scope.level === "region") return { regionId: scope.regionId };
  return { organization: true };
}

const isActiveAt = (startsAt: string, endsAt: string | null, now: Date) =>
  new Date(startsAt) <= now && (endsAt === null || new Date(endsAt) > now);

/** Builds the full set of grants for a member at a point in time. */
export function resolveGrants(input: {
  memberId: ID;
  chapterId: ID | null;
  assignments: RoleAssignment[];
  delegations: AuthorityDelegation[];
  /** Chapters, to tell whether a regional post covers a chapter (for delegations). */
  chapters?: Chapter[];
  now?: Date;
}): { grants: Grant[]; roles: Actor["roles"] } {
  const now = input.now ?? new Date();
  const grants: Grant[] = [];
  const roles: Actor["roles"] = [];

  if (input.chapterId) {
    for (const p of MEMBER_BASELINE.permissions) {
      grants.push({ permission: p, scope: { level: "chapter", chapterId: input.chapterId }, source: { kind: "baseline" } });
    }
  }

  for (const a of input.assignments) {
    if (a.memberId !== input.memberId || a.status !== "active" || !isActiveAt(a.assignedAt, a.endedAt, now)) continue;
    const role = roleByKey.get(a.roleKey);
    if (!role) continue;
    roles.push({ assignment: a, role });
    for (const p of role.permissions) {
      grants.push({ permission: p, scope: a.scope, source: { kind: "role", roleKey: role.key, assignmentId: a.id } });
    }
  }

  // A delegation is lent from a post: it lasts only while whoever granted it still holds that power there.
  const org: OrgStructure = { chapters: input.chapters ?? [] };
  const grantorHolds = (grantorId: ID, permission: Permission, scope: Scope) =>
    input.assignments.some(
      (a) =>
        a.memberId === grantorId &&
        a.status === "active" &&
        isActiveAt(a.assignedAt, a.endedAt, now) &&
        !!roleByKey.get(a.roleKey)?.permissions.includes(permission) &&
        scopeCovers(a.scope, scopeToTarget(scope), org),
    );
  for (const d of input.delegations) {
    if (d.grantedTo !== input.memberId || d.status !== "active" || !isActiveAt(d.startsAt, d.endsAt, now)) continue;
    for (const p of d.permissions) {
      if (!grantorHolds(d.grantedBy, p, d.scope)) continue;
      grants.push({ permission: p, scope: d.scope, source: { kind: "delegation", delegationId: d.id, grantedBy: d.grantedBy } });
    }
  }

  roles.sort((x, y) => x.role.rank - y.role.rank);
  return { grants, roles };
}

/** Does a grant at `scope` reach `target`? Organisation ⊃ region ⊃ chapter. */
export function scopeCovers(scope: Scope, target: Target, org: OrgStructure): boolean {
  if (scope.level === "organization") return true;
  if ("organization" in target) return false;

  if (scope.level === "region") {
    if ("regionId" in target) return target.regionId === scope.regionId;
    const chapter = org.chapters.find((c) => c.id === target.chapterId);
    return chapter?.regionId === scope.regionId;
  }

  // chapter-level grant
  return "chapterId" in target && target.chapterId === scope.chapterId;
}

export function can(actor: Actor, permission: Permission, target: Target, org: OrgStructure): boolean {
  if (actor.member.status !== "active") return false;
  return actor.grants.some((g) => g.permission === permission && scopeCovers(g.scope, target, org));
}

/** Holds the permission anywhere at all — used only to decide what UI to show. */
export function hasAnywhere(actor: Actor, permission: Permission): boolean {
  return actor.member.status === "active" && actor.grants.some((g) => g.permission === permission);
}

/** Every chapter in which the actor holds `permission`. */
export function chaptersWhere(actor: Actor, permission: Permission, org: OrgStructure): ID[] {
  return org.chapters.filter((c) => can(actor, permission, { chapterId: c.id }, org)).map((c) => c.id);
}

/* ── Role assignment rules ─────────────────────────────────────────────── */

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * May `actor` give `roleKey` at `scope` to `targetMember` (currently in
 * `targetChapterId`)? Every rule here is mirrored in the `assign_role`
 * database function.
 */
export function canAssignRole(
  actor: Actor,
  input: { targetMemberId: ID; targetChapterId: ID; roleKey: string; scope: Scope },
  org: OrgStructure,
): Decision {
  if (input.targetMemberId === actor.member.id) {
    return { ok: false, reason: "You cannot change your own roles. Another authorized officer must do this." };
  }

  const role = roleByKey.get(input.roleKey);
  if (!role) return { ok: false, reason: "Unknown role." };
  if (role.scopeLevel !== input.scope.level) {
    return { ok: false, reason: `${role.name} is held at ${role.scopeLevel} level.` };
  }

  if (!can(actor, "ASSIGN_ROLE", scopeToTarget(input.scope), org)) {
    return { ok: false, reason: "You are not authorized to assign roles in this part of the organisation." };
  }

  const mayAppoint = actor.roles.some(
    (r) => r.role.assignableRoles.includes(role.key) && scopeCovers(r.assignment.scope, scopeToTarget(input.scope), org),
  );
  if (!mayAppoint) return { ok: false, reason: `Your role does not allow appointing a ${role.name}.` };

  // An officer belongs to a chapter inside the scope they serve (a Regional Coordinator: a chapter of that region).
  if (!scopeCovers(input.scope, { chapterId: input.targetChapterId }, org)) {
    return { ok: false, reason: "The member must belong to a chapter within the role’s scope." };
  }

  return { ok: true };
}

/**
 * Financial WRITES (record / correct / void) on a ledger. Every record has
 * exactly one owner:
 *  - a chapter's ledger is written by that chapter's officers — an
 *    organisation-wide grant deliberately does NOT reach down into it;
 *  - the central ledger is written at organisation level (the Central
 *    Financial Secretary).
 * Viewing is not affected: org-level VIEW_CONTRIBUTIONS still sees everything.
 */
export type Ledger = "chapter" | "central" | "committee";

export function canWriteLedger(
  actor: Actor,
  permission: "RECORD_CONTRIBUTION" | "EDIT_CONTRIBUTION" | "VOID_CONTRIBUTION",
  ledger: Ledger,
  chapterId: ID | null,
  org: OrgStructure,
): boolean {
  if (actor.member.status !== "active") return false;
  if (ledger === "committee") return false; // committee books are kept by the committee's Financial Secretary (lib/portal/committees.ts)
  if (ledger === "central") return can(actor, permission, { organization: true }, org);
  if (!chapterId) return false;
  return actor.grants.some((g) => g.permission === permission && g.scope.level !== "organization" && scopeCovers(g.scope, { chapterId }, org));
}

/** Are these the same place (not merely one inside the other)? */
export function sameScope(a: Scope, b: Scope): boolean {
  if (a.level !== b.level) return false;
  if (a.level === "region") return a.regionId === (b as typeof a).regionId;
  if (a.level === "chapter") return a.chapterId === (b as typeof a).chapterId;
  return true;
}

/**
 * Holds `permission` at exactly `scope` — authority neither reaches down
 * into lower bodies nor up. Used for a body's own funds and projects: a
 * chapter's spending and projects are set by the chapter, a region's by its
 * coordinator, the organisation's by central officers.
 */
export function canAtExactly(actor: Actor, permission: Permission, scope: Scope): boolean {
  if (actor.member.status !== "active") return false;
  return actor.grants.some((g) => g.permission === permission && sameScope(g.scope, scope));
}

/** Scopes at which the actor holds `permission` exactly (deduplicated). */
export function exactScopesWhere(actor: Actor, permission: Permission): Scope[] {
  if (actor.member.status !== "active") return [];
  const out: Scope[] = [];
  for (const g of actor.grants) if (g.permission === permission && !out.some((s) => sameScope(s, g.scope))) out.push(g.scope);
  return out;
}

/** Chapters whose ledger the actor may write to with `permission`. */
export function ledgerChaptersWhere(actor: Actor, permission: "RECORD_CONTRIBUTION" | "EDIT_CONTRIBUTION" | "VOID_CONTRIBUTION", org: OrgStructure): ID[] {
  return org.chapters.filter((c) => canWriteLedger(actor, permission, "chapter", c.id, org)).map((c) => c.id);
}

/**
 * May `actor` create a chapter in `regionId`? Chapters are created only by
 * the Regional Coordinator of the region they belong to — every new chapter
 * belongs to a region (diaspora chapters to diaspora regions). Organisation-
 * wide authority, including the President General's, does not reach down
 * here: the President General creates regions, not chapters.
 */
export function canCreateChapter(actor: Actor, regionId: ID | null): boolean {
  if (actor.member.status !== "active" || !regionId) return false;
  return actor.grants.some((g) => g.permission === "CREATE_CHAPTER" && g.scope.level === "region" && g.scope.regionId === regionId);
}

/**
 * May `actor` suspend or reinstate a member?
 *  - never themselves;
 *  - needs SUSPEND_MEMBER over the member's chapter;
 *  - an office holder can only be suspended by someone who may appoint every
 *    office they hold (so a Chapter President cannot suspend another
 *    President, and nobody can suspend the President General from inside).
 */
export function canChangeMemberStatus(
  actor: Actor,
  input: { targetMemberId: ID; targetChapterId: ID; targetRoleKeys: string[] },
  org: OrgStructure,
): Decision {
  if (input.targetMemberId === actor.member.id) {
    return { ok: false, reason: "You cannot change your own membership status." };
  }
  if (!can(actor, "SUSPEND_MEMBER", { chapterId: input.targetChapterId }, org)) {
    return { ok: false, reason: "You are not authorized to suspend or reinstate members of this chapter." };
  }
  const appointable = new Set(actor.roles.flatMap((r) => r.role.assignableRoles));
  const outranks = input.targetRoleKeys.every((k) => appointable.has(k));
  if (!outranks) {
    return { ok: false, reason: "This member holds an office you do not appoint. Their suspension must come from higher authority." };
  }
  return { ok: true };
}

export function canEndRole(actor: Actor, assignment: RoleAssignment, org: OrgStructure): Decision {
  if (assignment.memberId === actor.member.id) {
    return { ok: false, reason: "You cannot change your own roles. Another authorized officer must do this." };
  }
  if (assignment.status !== "active") return { ok: false, reason: "This role has already ended." };
  if (!can(actor, "REMOVE_ROLE", scopeToTarget(assignment.scope), org)) {
    return { ok: false, reason: "You are not authorized to remove roles in this part of the organisation." };
  }
  const mayManage = actor.roles.some(
    (r) =>
      r.role.assignableRoles.includes(assignment.roleKey) &&
      scopeCovers(r.assignment.scope, scopeToTarget(assignment.scope), org),
  );
  return mayManage ? { ok: true } : { ok: false, reason: "Your role does not manage this office." };
}
