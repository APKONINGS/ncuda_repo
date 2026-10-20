import "server-only";
import type { DocumentRecord, Meeting, NotificationRecord, Scope } from "@/lib/domain/types";
import { db } from "@/lib/demo/store";
import { can, canAtExactly, hasAnywhere, scopeCovers, scopeToTarget, type Actor } from "@/lib/permissions/engine";
import type { Permission } from "@/lib/permissions/catalog";

/**
 * Visibility rules shared by every portal query. In Supabase these are the
 * SELECT policies on each table; here they guard the demo store.
 */

export const org = () => ({ chapters: db().chapters });

/** Is this scope part of the member's own organisational line (org → region → chapter)? */
export function inMembershipLine(actor: Actor, scope: Scope) {
  if (scope.level === "organization") return true;
  if (scope.level === "region") return scope.regionId === actor.regionId || servesRegion(actor, scope.regionId);
  return scope.chapterId === actor.chapterId;
}

export function canIn(actor: Actor, permission: Permission, scope: Scope) {
  return can(actor, permission, scopeToTarget(scope), org());
}

export function canAnyIn(actor: Actor, permissions: Permission[], scope: Scope) {
  return permissions.some((p) => canIn(actor, p, scope));
}

const MEETING_OFFICER: Permission[] = ["CREATE_MEETING", "EDIT_MEETING", "RECORD_ATTENDANCE", "CREATE_MINUTES"];

/** Does this member hold a post within the scope (an executive there)? */
export function holdsPostWithin(memberId: string, scope: Scope) {
  const d = db();
  return d.assignments.some((a) => {
    if (a.memberId !== memberId || a.status !== "active") return false;
    if (scope.level === "organization") return true;
    if (scope.level === "region") {
      if (a.scope.level === "region") return a.scope.regionId === scope.regionId;
      return a.scope.level === "chapter" && d.chapters.find((c) => c.id === (a.scope as { chapterId: string }).chapterId)?.regionId === scope.regionId;
    }
    return a.scope.level === "chapter" && a.scope.chapterId === scope.chapterId;
  });
}

/** Is the actor one of the people the meeting is for? */
export function invitedTo(actor: Actor, meeting: Meeting) {
  const audience = meeting.audience ?? "all";
  if (audience === "selected") {
    if ((meeting.inviteeIds ?? []).includes(actor.member.id)) return true;
    // Whole chapters or regions called to a national meeting.
    return (!!actor.chapterId && (meeting.inviteeChapterIds ?? []).includes(actor.chapterId)) || (!!actor.regionId && (meeting.inviteeRegionIds ?? []).includes(actor.regionId));
  }
  if (audience === "executives") return holdsPostWithin(actor.member.id, meeting.scope);
  return inMembershipLine(actor, meeting.scope);
}

/** Runs this meeting: holds `permission` at exactly the meeting's level (officers above only see it). */
export function runsMeeting(actor: Actor, permission: Permission, meeting: { scope: Scope }) {
  return !actor.inactive && canAtExactly(actor, permission, meeting.scope);
}

/** The people a meeting is for and the officers who run meetings there (the post, not whoever scheduled it). */
export function meetingVisible(actor: Actor, meeting: Meeting) {
  return invitedTo(actor, meeting) || canAnyIn(actor, MEETING_OFFICER, meeting.scope);
}

/**
 * Who can see a document:
 *  - the person who uploaded it;
 *  - if it was attached to a message, anyone who can see that message (or a forward of it);
 *  - if the uploader chose specific offices, only holders of those offices within the scope;
 *  - otherwise everyone in the scope's line, plus officers with document rights over it
 *    (financial documents additionally need financial-report access).
 */
export function documentVisible(actor: Actor, doc: DocumentRecord) {
  if (doc.committeeId) return false; // committee documents: see lib/portal/committees.ts
  if (doc.uploadedBy === actor.member.id) return true;
  if (doc.meetingId) {
    const meeting = db().meetings.find((m) => m.id === doc.meetingId);
    return !!meeting && meetingVisible(actor, meeting);
  }
  if (db().notifications.some((n) => n.attachmentIds?.includes(doc.id) && notificationVisible(actor, n))) return true;
  if (doc.attachment) return false;
  if (doc.roleKeys?.length) {
    return belongsWithin(actor, doc.scope) && actor.roles.some((r) => doc.roleKeys!.includes(r.role.key));
  }
  const visible = inMembershipLine(actor, doc.scope) || canAnyIn(actor, ["UPLOAD_DOCUMENT", "DOWNLOAD_DOCUMENT"], doc.scope);
  if (!visible) return false;
  if (doc.category === "financial") return canIn(actor, "VIEW_FINANCIAL_REPORTS", doc.scope);
  return true;
}

/** Every active member holds the baseline download right, so anything visible can be downloaded. */
export function documentDownloadable(actor: Actor, doc: DocumentRecord) {
  return documentVisible(actor, doc) && hasAnywhere(actor, "DOWNLOAD_DOCUMENT");
}

/** Does the actor's chapter fall inside `scope`? (Where they belong, not what they hold.) */
export function belongsWithin(actor: Actor, scope: Scope) {
  if (actor.chapterId) return scopeCovers(scope, { chapterId: actor.chapterId }, org());
  // Not in a chapter yet: they belong to the organisation and to any region they serve.
  return scope.level === "organization" || (scope.level === "region" && servesRegion(actor, scope.regionId));
}

/** Holds an office for this region (e.g. its Regional Coordinator). */
function servesRegion(actor: Actor, regionId: string) {
  return actor.roles.some((r) => r.assignment.scope.level === "region" && r.assignment.scope.regionId === regionId);
}

export function notificationVisible(actor: Actor, n: NotificationRecord) {
  const a = n.audience;
  if (a.kind === "member") return a.memberId === actor.member.id;
  if (a.kind === "scope") return inMembershipLine(actor, a.scope);
  return belongsWithin(actor, a.scope) && actor.roles.some((r) => a.roleKeys.includes(r.role.key));
}

export function scopeLabel(scope: Scope) {
  const d = db();
  if (scope.level === "organization") return "Whole organisation";
  if (scope.level === "region") return d.regions.find((r) => r.id === scope.regionId)?.name ?? "Region";
  return d.chapters.find((c) => c.id === scope.chapterId)?.name ?? "Chapter";
}
