import "server-only";
import type { Contribution, ID, RegistrationRenewal } from "@/lib/domain/types";
import { currentChapterId, db } from "@/lib/demo/store";

/*
 * Registration. Everyone must belong to a chapter and pay its registration
 * fee there to be active, the President General, Regional Coordinators and
 * chapter officers included. Each chapter's Financial Secretary sets the
 * chapter's fee, one amount for everyone, and records the payments (their
 * own too).
 *
 *  - Before the first yearly renewal: any registration payment makes a
 *    member active.
 *  - Once the President General starts the renewal for a year, a payment
 *    for that year is needed; until then the member is inactive again.
 *
 * Inactive officers keep only their setup powers (see lib/auth/actor.ts).
 */

/** The renewal in force: the latest one started (null before the first). */
export function currentRenewal(): RegistrationRenewal | null {
  const all = db().renewals ?? [];
  return all.length ? all[all.length - 1] : null;
}

/** The year a registration payment recorded now counts for. */
export function registrationYear() {
  return currentRenewal()?.year ?? new Date().getFullYear();
}

/** A chapter's registration fee (null until its Financial Secretary sets it). */
export function chapterFee(chapterId: ID | null | undefined) {
  if (!chapterId) return null;
  return db().chapters.find((c) => c.id === chapterId)?.registrationFee ?? null;
}

/** The member's registration payment that keeps them active now, if any. */
export function currentRegistrationPayment(memberId: ID): Contribution | null {
  const renewal = currentRenewal();
  return (
    db().contributions.find(
      (c) => c.memberId === memberId && c.registrationFee && c.status === "recorded" && (!renewal || c.registrationFee.year === renewal.year),
    ) ?? null
  );
}

/** Where a member stands: their chapter, its fee, and whether they are registered. */
export function registrationStanding(memberId: ID) {
  const chapterId = currentChapterId(memberId);
  const payment = currentRegistrationPayment(memberId);
  return {
    year: registrationYear(),
    renewal: !!currentRenewal(),
    chapterId,
    fee: chapterFee(chapterId),
    registered: !!payment,
    paid: payment?.amount ?? 0,
    receipt: payment?.reference ?? null,
  };
}

/** Is this member inactive because they have not paid their registration (for the year in force)? */
export function registrationDue(memberId: ID): { year: number; chapterId: ID | null } | null {
  const s = registrationStanding(memberId);
  return s.registered ? null : { year: s.year, chapterId: s.chapterId };
}
