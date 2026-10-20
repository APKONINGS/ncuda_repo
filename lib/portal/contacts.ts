import "server-only";
import type { ID } from "@/lib/domain/types";
import { db } from "@/lib/demo/store";
import type { Actor } from "@/lib/permissions/engine";

export type ContactInfo = { email: string; phone: string | null };

/**
 * Officers see a person's email and phone wherever they see that person, so
 * they can get in touch straight away: anyone holding a post, and anyone
 * holding a position on an active committee. Ordinary members see names
 * only, to protect members' privacy.
 */
export function seesContacts(actor: Actor) {
  if (actor.roles.length > 0) return true;
  const d = db();
  return (d.committeeMembers ?? []).some(
    (m) => m.memberId === actor.member.id && m.endedAt === null && m.position !== null && (d.committees ?? []).some((c) => c.id === m.committeeId && c.status === "active"),
  );
}

/** A person's contact details, or null when the actor may not see them. */
export function contactFor(actor: Actor, memberId: ID | null | undefined): ContactInfo | null {
  if (!memberId || !seesContacts(actor)) return null;
  const m = db().members.find((x) => x.id === memberId);
  return m ? { email: m.email, phone: m.phone ?? null } : null;
}
