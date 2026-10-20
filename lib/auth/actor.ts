import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { currentChapterId, db, syncStore } from "@/lib/demo/store";
import { resolveGrants, type Actor } from "@/lib/permissions/engine";
import { registrationDue } from "@/lib/portal/registration";
import { readSession } from "./session";

/**
 * Resolves the signed-in member, their chapter, roles and grants — fresh on
 * every request, so role changes take effect immediately.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await readSession();
  if (!session) return null;
  await syncStore();
  return buildActor(session.sub);
});

export function buildActor(memberId: string): Actor | null {
  const data = db();
  const member = data.members.find((m) => m.id === memberId);
  if (!member || member.status !== "active") return null;

  // A member may not be in a chapter yet (e.g. a newly appointed Regional
  // Coordinator); they then act only through their offices.
  const chapterId = currentChapterId(member.id);
  const chapter = data.chapters.find((c) => c.id === chapterId) ?? null;

  const { grants, roles } = resolveGrants({
    memberId: member.id,
    chapterId: chapter?.id ?? null,
    assignments: data.assignments,
    delegations: data.delegations,
    chapters: data.chapters,
  });

  // Registration unpaid: offices keep their titles but only their setup powers, so the
  // organisation can be built and fees collected before anyone is active — the
  // President General creates regions and their coordinators and manages registration;
  // coordinators create chapters; Financial Secretaries set the chapter's fee, register
  // members and record registration payments (only those: see recordContribution).
  // Moving members stays only so someone without a chapter can join one (see transferOptions).
  const inactive = registrationDue(member.id);
  const kept = new Set(["CREATE_REGION", "CREATE_CHAPTER", "CREATE_MEMBER", "VIEW_MEMBER", "RECORD_CONTRIBUTION", "MANAGE_REGISTRATION", "TRANSFER_MEMBER"]);
  // Everyone must belong to a chapter. Someone without one (the President General
  // or a Regional Coordinator at the start) may set things up only until a chapter
  // they could join exists — anywhere for the President General, in their region for
  // a coordinator. From then on, all they can do is join one.
  const mustJoinChapter =
    !chapter &&
    data.chapters.some((c) =>
      grants.some(
        (g) =>
          g.permission === "TRANSFER_MEMBER" &&
          (g.scope.level === "organization" || (g.scope.level === "region" && g.scope.regionId === c.regionId) || (g.scope.level === "chapter" && g.scope.chapterId === c.id)),
      ),
    );
  const effective = mustJoinChapter ? grants.filter((g) => g.permission === "TRANSFER_MEMBER") : inactive ? grants.filter((g) => kept.has(g.permission)) : grants;

  return { member, chapterId: chapter?.id ?? null, regionId: chapter?.regionId ?? null, roles, grants: effective, inactive, mustJoinChapter };
}

/**
 * Use at the top of every portal page and server action. A member who is
 * inactive (registration unpaid) is sent to the overview — unless the page or
 * action is one they may still use (`allowInactive`): the overview, their
 * profile, their own finances and, for Financial Secretaries, recording
 * registration payments.
 */
export async function requireActor(opts: { allowInactive?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/member-portal");
  if (actor.inactive && !opts.allowInactive) redirect("/dashboard?inactive=1");
  return actor;
}
