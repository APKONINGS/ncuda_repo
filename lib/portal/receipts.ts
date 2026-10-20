import "server-only";
import type { Contribution, Expense } from "@/lib/domain/types";
import { db, newId } from "@/lib/demo/store";
import { formatDate, formatMoney } from "@/lib/utils";
import { chapterName, memberName, postAt } from "./queries";

/*
 * Receipts in the payer's notifications. Every payment recorded for a member —
 * registration, a project contribution or a fine — sends them its receipt; a
 * fine imposed to be paid later sends a notice of what is owed; a voided record
 * tells them it was cancelled, and why. The same notices are sent by the
 * database (contribution_receipt()) on Supabase.
 */

const MINE = "/dashboard/finances?tab=mine";

/** "Registration 2026", "Contribution", "Fine". */
function kindLabel(c: Contribution) {
  if (c.registrationFee) return `Registration ${c.registrationFee.year}`;
  return c.type === "fine" ? "Fine" : "Contribution";
}

/** What the payment was for: the project's name, the fine's reason, or the year's registration. */
function forWhat(c: Contribution) {
  if (c.registrationFee) return `Registration fee ${c.registrationFee.year}`;
  if (c.collectionId) return db().collections.find((p) => p.id === c.collectionId)?.name ?? c.description;
  return c.description;
}

const where = (c: Contribution) => (c.ledger === "central" ? "NCUDA central" : chapterName(c.chapterId));
const recorder = (c: Contribution) => `${memberName(c.recordedBy)} (${postAt(c.recordedBy, c.recordedAt)})`;

function notify(c: Contribution, title: string, body: string) {
  db().notifications.push({
    id: newId("nt"),
    type: "receipt",
    title,
    body,
    audience: { kind: "member", memberId: c.memberId },
    link: MINE,
    createdBy: c.recordedBy,
    createdAt: new Date().toISOString(),
  });
}

/** Sends the payer their receipt (or, for a fine imposed unpaid, the notice of what they owe). */
export function sendReceipt(c: Contribution) {
  if (c.type === "fine" && c.amount === 0) {
    notify(
      c,
      `Fine imposed · ${formatMoney(c.expectedAmount ?? 0)}`,
      `${where(c)} recorded a fine of ${formatMoney(c.expectedAmount ?? 0)} for: ${c.description}. It is to be paid in full to the Financial Secretary. Reference ${c.reference}. Recorded by ${recorder(c)}.`,
    );
    return;
  }
  notify(
    c,
    `Receipt ${c.reference} · ${kindLabel(c)}`,
    `Received ${formatMoney(c.amount)} from you on ${formatDate(c.receivedOn)} for: ${forWhat(c)}. Paid in full to ${where(c)}. Recorded by ${recorder(c)}. Keep the receipt number ${c.reference} for your records.`,
  );
}

/** Tells the payer a record of theirs was cancelled, with the reason. */
export function sendVoidNotice(c: Contribution) {
  notify(
    c,
    `Cancelled: ${c.amount === 0 ? "fine" : "receipt"} ${c.reference}`,
    `The ${kindLabel(c).toLowerCase()} record ${c.reference} (${formatMoney(c.amount || c.expectedAmount || 0)}, ${forWhat(c)}) was cancelled by ${memberName(c.voidedBy)}. Reason: ${c.voidReason}. If you think this is wrong, please contact your Financial Secretary.`,
  );
}

/* ── Project money: the project manager's receipt ── */

function notifyManager(e: Expense, title: string, body: string, from: string) {
  if (!e.sentFor) return;
  const committee = (db().committees ?? [])
    .filter((c) => c.collectionId === e.sentFor!.collectionId && c.status === "active")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  db().notifications.push({
    id: newId("nt"),
    type: "receipt",
    title,
    body,
    audience: { kind: "member", memberId: e.sentFor.toMemberId },
    link: committee ? `/dashboard/committees/${committee.id}` : "/dashboard/finances?tab=collections",
    createdBy: from,
    createdAt: new Date().toISOString(),
  });
}

const projectName = (e: Expense) => db().collections.find((p) => p.id === e.sentFor?.collectionId)?.name ?? "the project";
const fromWhere = (e: Expense) => (e.scope.level === "chapter" ? chapterName(e.scope.chapterId) : "the chapter");

/** A chapter sent project money: the project manager gets the receipt. */
export function sendProjectMoneyReceipt(e: Expense) {
  notifyManager(
    e,
    `Receipt ${e.reference} · Project money`,
    `Received ${formatMoney(e.amount)} from ${fromWhere(e)} on ${formatDate(e.spentOn)} for the project “${projectName(e)}”. Sent by ${memberName(e.recordedBy)} (${postAt(e.recordedBy, e.recordedAt)}). Keep the voucher number ${e.reference} for your records.`,
    e.recordedBy,
  );
}

/** The chapter voided money it had recorded as sent: the project manager is told, with the reason. */
export function sendProjectMoneyVoidNotice(e: Expense) {
  notifyManager(
    e,
    `Cancelled: receipt ${e.reference}`,
    `${fromWhere(e)}'s record of ${formatMoney(e.amount)} sent to you for “${projectName(e)}” (${e.reference}) was cancelled by ${memberName(e.voidedBy)}. Reason: ${e.voidReason}. It no longer counts towards what you hold for the project.`,
    e.voidedBy ?? e.recordedBy,
  );
}
