import "server-only";
import { z } from "zod";
import { phoneSchema } from "@/lib/phone";
import type { AttendanceStatus, DocumentCategory, Member, NotificationRecord, Scope } from "@/lib/domain/types";
import { currentChapterId, db, newId, nextReference } from "@/lib/demo/store";
import { can, canAssignRole, canAtExactly, canChangeMemberStatus, canCreateChapter, canEndRole, canWriteLedger, hasAnywhere, type Actor } from "@/lib/permissions/engine";
import { roleByKey, roleName } from "@/lib/permissions/roles";
import { formatMoney, watToday } from "@/lib/utils";
import { passwordMatches, passwordRule, setMemberPassword } from "@/lib/auth/demo-credentials";
import { recordAudit } from "./audit";
import { checkFile, MAX_ATTACHMENTS, putFile, safeFilename, type IncomingFile } from "./files";
import { audienceLabel, canEditChapter, finesOwedBy, centralCollections, chapterPresidentCandidates, collectionsForChapter, coordinatorCandidates, currentPost, transferOptions, expectedFor, FORWARDABLE_TYPES, holdersOf, memberName as memberNameOf, recipientsOf, rootId } from "./queries";
import { canIn, notificationVisible, org, runsMeeting, scopeLabel } from "./visibility";
import { chapterFee, currentRegistrationPayment, registrationYear } from "./registration";
import { meetingInvitees } from "./meetings";
import { sendProjectMoneyVoidNotice, sendReceipt, sendVoidNotice } from "./receipts";

/*
 * Write-side portal commands. Every command:
 *   1. validates input,
 *   2. re-checks authorization on the server (never trusts the UI),
 *   3. preserves history (void / end — never destroy),
 *   4. writes an audit entry.
 * In Supabase these become RPC functions guarded by RLS.
 */

export type CommandResult = { ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const fail = (error: string, fieldErrors?: Record<string, string>): CommandResult => ({ ok: false, error, fieldErrors });

function fieldErrorsFrom(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.map(String).join(".")] ??= i.message; // nested fields: "financialSecretary.phone"
  return out;
}

const DENIED = "You are not authorized to do this. The request was refused and nothing was changed.";

/* ── Contributions ──────────────────────────────────────────────────── */

/** Whole francs; thousand separators typed by people ("12,000" / "12 000") are accepted. */
const francs = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s,\u00a0\u202f]/g, "") : v),
    z.coerce.number({ message }).int("Whole francs only.").min(0, "Cannot be negative.").max(100_000_000, "That amount is too large."),
  );

export const contributionSchema = z.object({
  ledger: z.enum(["chapter", "central"]).default("chapter"),
  /** Chapter ledger: the paying member. */
  memberId: z.string().optional(),
  /** Central ledger: "member:<id>" — a member paying the centre directly. */
  payer: z.string().optional(),
  /** Registration is its own category (stored as a registration-fee record, not a project contribution). */
  type: z.enum(["contribution", "fine", "registration"], { message: "Choose Contribution, Fine or Registration." }),
  /** The project — required for a contribution, never allowed for a fine. "registration" = the member's registration fee. */
  collectionId: z.string().optional().default(""),
  /** For a fine: "new", or the id of an earlier fine this payment goes towards. */
  fineId: z.string().optional().default(""),
  /** Only typed for a new fine (its reason); a contribution takes its project's purpose. */
  description: z.string().trim().max(200).optional().default(""),
  /** Only typed for a new fine (the fine imposed); otherwise derived on the server. */
  expectedAmount: z.union([z.literal(""), francs("Enter the fine imposed.")]).optional(),
  /** A new fine: "yes" if it was paid in full now, "no" if it is imposed and paid later. */
  paidNow: z.enum(["yes", "no"]).optional(),
  receivedOn: z.iso.date("Enter the date received."),
});

/**
 * Records a payment received offline.
 *  - Chapter ledger: by the member's chapter officers (RECORD_CONTRIBUTION
 *    held at chapter or region level for that chapter).
 *  - Central ledger: money a member pays directly to the central body, by
 *    the National Financial Secretary.
 * The description and expected amount of a contribution come from its
 * project, never from the form; the receipt number is generated here.
 *
 * There are no partial payments: a contribution is always the full amount
 * due for the project (once per project), and a fine is either paid in full
 * when imposed, or imposed now and later paid in full in one payment.
 */
export function recordContribution(actor: Actor, raw: unknown): CommandResult {
  const parsed = contributionSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();
  const o = org();
  const payerField = input.ledger === "central" ? "payer" : "memberId";

  // Who paid? Always a member.
  const payerId = input.ledger === "central" ? (input.payer ?? "").replace(/^member:/, "") : (input.memberId ?? "");
  const member = d.members.find((m) => m.id === payerId && m.status === "active");
  const chapterId = member ? currentChapterId(member.id) : null;
  if (!member || !chapterId) return fail("Choose the member who paid.", { [payerField]: "Choose a member." });
  const memberId = member.id;
  const payerName = member.fullName;

  if (!canWriteLedger(actor, "RECORD_CONTRIBUTION", input.ledger, chapterId, o)) return fail(DENIED);
  // A Financial Secretary whose own registration is unpaid may only record registration payments.
  const registration = input.type === "registration" || (input.type === "contribution" && input.collectionId === "registration");
  if (actor.inactive && !registration) {
    return fail(`Only registration payments until your Registration ${actor.inactive.year} is paid.`, { collectionId: "Registration only." });
  }
  if (registration) return recordRegistration(actor, input.ledger, member, chapterId, input.receivedOn);
  if (input.receivedOn > watToday()) return fail("The date received cannot be in the future.", { receivedOn: "Date is in the future." });

  let description: string;
  let expectedAmount: number | undefined;
  let collectionId: string | undefined;
  let settlesFineId: string | undefined;
  let amount = 0;

  if (input.type === "contribution") {
    const allowed = input.ledger === "central" ? centralCollections() : collectionsForChapter(chapterId);
    const project = allowed.find((c) => c.id === input.collectionId);
    if (!input.collectionId) return fail("Choose the project this contribution is for.", { collectionId: "Choose a project." });
    if (!project) return fail("That project does not apply to this member.", { collectionId: "Not available." });
    expectedAmount = expectedFor(project, memberId);
    if (expectedAmount <= 0) return fail(`${payerName} owes nothing towards this project.`, { collectionId: "Nothing due." });
    if (d.contributions.some((c) => c.memberId === memberId && c.collectionId === project.id && c.type === "contribution" && c.status === "recorded"))
      return fail(`${payerName} has already paid “${project.name}”.`, { collectionId: "Already paid." });
    collectionId = project.id;
    description = project.description;
    amount = expectedAmount;
  } else {
    // Fines are never part of a project.
    if (input.collectionId) return fail("Fines are not part of a project.", { collectionId: "Fines are not part of a project." });
    if (input.fineId && input.fineId !== "new") {
      const earlier = outstandingFineFor(memberId, input.ledger, input.fineId);
      if (!earlier) return fail("That fine could not be found or is already paid.", { fineId: "Choose another fine." });
      settlesFineId = earlier.id;
      description = earlier.description;
      amount = earlier.balance; // paid in full
    } else {
      if (input.description.length < 3) return fail("Give the reason for the fine.", { description: "Give the reason." });
      if (typeof input.expectedAmount !== "number" || input.expectedAmount <= 0) return fail("Enter the fine imposed.", { expectedAmount: "Enter the fine." });
      if (!input.paidNow) return fail("Say whether the fine was paid now.", { paidNow: "Choose one." });
      description = input.description;
      expectedAmount = input.expectedAmount;
      amount = input.paidNow === "yes" ? input.expectedAmount : 0;
    }
  }

  const id = newId("ct");
  const reference = nextReference("RC");
  const now = new Date().toISOString();
  d.contributions.push({
    id,
    ledger: input.ledger,
    memberId,
    chapterId,
    type: input.type === "fine" ? "fine" : "contribution",
    description,
    expectedAmount,
    amount,
    settlesFineId,
    currency: "XAF",
    receivedOn: `${input.receivedOn}T12:00:00Z`,
    reference,
    collectionId,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: now,
  });
  sendReceipt(d.contributions.at(-1)!);
  const unpaidFine = input.type === "fine" && !settlesFineId && amount === 0;
  recordAudit(actor, {
    action: "CREATE",
    entityType: "contribution",
    entityId: id,
    // Central records are audited at organisation level; chapter records at the chapter.
    chapterId: input.ledger === "central" ? null : chapterId,
    regionId: input.ledger === "central" ? null : undefined,
    summary: unpaidFine
      ? `Recorded a fine of ${formatMoney(expectedAmount!)} for ${payerName} (unpaid) — ${reference}`
      : `Recorded ${input.ledger === "central" ? "central " : ""}${input.type} of ${formatMoney(amount)} from ${payerName} — ${reference}`,
    newValues: { type: input.type, amount, expectedAmount: expectedAmount ?? null, collectionId: collectionId ?? null, settlesFineId: settlesFineId ?? null, reference },
  });
  if (unpaidFine) return { ok: true, message: `Fine of ${formatMoney(expectedAmount!)} imposed on ${payerName}. Ref. ${reference}.` };
  return { ok: true, message: `Recorded ${formatMoney(amount)} from ${payerName}. Receipt ${reference}.` };
}

/**
 * A registration payment, recorded by the Financial Secretary of the member's
 * chapter at the chapter's fee (paid in full, once for the year in force).
 * It makes the member active.
 */
function recordRegistration(actor: Actor, ledger: "chapter" | "central", member: Member, chapterId: string, receivedOn: string): CommandResult {
  if (ledger !== "chapter") return fail("Registration is paid at the member's own chapter.", { collectionId: "Not in the central ledger." });
  const fee = chapterFee(chapterId);
  const chapter = db().chapters.find((c) => c.id === chapterId)!;
  if (!fee) return fail(`${chapter.name}'s registration amount is not set yet.`, { collectionId: "Amount not set." });
  const year = registrationYear();
  if (currentRegistrationPayment(member.id)) return fail(`${member.fullName} has already paid their registration for ${year}.`, { collectionId: "Already paid." });
  const reference = nextReference("RC");
  const now = new Date().toISOString();
  db().contributions.push({
    id: newId("ct"),
    ledger: "chapter",
    memberId: member.id,
    chapterId,
    type: "contribution",
    registrationFee: { year },
    description: `Registration fee ${year}`,
    expectedAmount: fee,
    amount: fee,
    currency: "XAF",
    receivedOn: `${receivedOn}T12:00:00Z`,
    reference,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: now,
  });
  sendReceipt(db().contributions.at(-1)!);
  recordAudit(actor, {
    action: "CREATE",
    entityType: "contribution",
    entityId: db().contributions.at(-1)!.id,
    chapterId,
    summary: `Recorded registration ${year} of ${formatMoney(fee)} from ${member.fullName} — ${reference}`,
    newValues: { registrationYear: year, amount: fee, reference },
  });
  return { ok: true, message: `${member.fullName} registered for ${year}. Receipt ${reference}.` };
}

export const chapterFeeSchema = z.object({
  chapterId: z.string().min(1),
  amount: francs("Enter the registration amount.").refine((n) => n > 0, "Enter the registration amount."),
});

/** A chapter's Financial Secretary sets (or changes) its registration fee; payments already recorded keep their amount. */
export function setChapterRegistrationFee(actor: Actor, raw: unknown): CommandResult {
  const parsed = chapterFeeSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const chapter = db().chapters.find((c) => c.id === parsed.data.chapterId);
  if (!chapter) return fail("Chapter not found.");
  if (!canAtExactly(actor, "CREATE_MEMBER", { level: "chapter", chapterId: chapter.id })) return fail("The chapter's registration amount is set by its Financial Secretary.");
  const before = chapter.registrationFee ?? null;
  if (before === parsed.data.amount) return fail("That is already the registration amount.", { amount: "Unchanged." });
  chapter.registrationFee = parsed.data.amount;
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "chapter",
    entityId: chapter.id,
    chapterId: chapter.id,
    summary: `${before === null ? "Set" : "Changed"} ${chapter.name}'s registration amount to ${formatMoney(parsed.data.amount)}${before === null ? "" : ` (was ${formatMoney(before)})`}`,
    oldValues: { registrationFee: before },
    newValues: { registrationFee: parsed.data.amount },
  });
  return { ok: true, message: `Registration amount: ${formatMoney(parsed.data.amount)}.` };
}

/** An earlier fine of this member, in this ledger, that still has a balance. */
function outstandingFineFor(memberId: string, ledger: "chapter" | "central", fineId: string) {
  const d = db();
  const fine = d.contributions.find((c) => c.id === fineId && c.type === "fine" && !c.settlesFineId && c.status === "recorded" && c.memberId === memberId && c.ledger === ledger);
  if (!fine) return null;
  const paid = fine.amount + d.contributions.filter((c) => c.settlesFineId === fine.id && c.status === "recorded").reduce((s, c) => s + c.amount, 0);
  const balance = (fine.expectedAmount ?? fine.amount) - paid;
  return balance > 0 ? { id: fine.id, description: fine.description, balance } : null;
}

export function voidContribution(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({ id: z.string().min(1), reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300) })
    .safeParse(raw);
  if (!parsed.success) return fail("Give a reason.", fieldErrorsFrom(parsed.error));

  const d = db();
  const row = d.contributions.find((c) => c.id === parsed.data.id);
  if (!row) return fail("Record not found.");
  if (!canWriteLedger(actor, "VOID_CONTRIBUTION", row.ledger, row.chapterId, org())) return fail(DENIED);
  if (row.status === "voided") return fail("Already cancelled.");
  if (d.contributions.some((c) => c.settlesFineId === row.id && c.status === "recorded")) {
    return fail("Payments have been recorded towards this fine. Void those payments first.");
  }

  const old = { status: row.status };
  row.status = "voided";
  row.voidedBy = actor.member.id;
  row.voidedAt = new Date().toISOString();
  row.voidReason = parsed.data.reason;
  sendVoidNotice(row);
  recordAudit(actor, {
    action: "VOID",
    entityType: "contribution",
    entityId: row.id,
    chapterId: row.ledger === "central" ? null : row.chapterId,
    regionId: row.ledger === "central" ? null : undefined,
    summary: `Cancelled ${row.ledger === "central" ? "central " : ""}${row.type} record ${row.reference} of ${formatMoney(row.amount)}`,
    oldValues: old,
    newValues: { status: "voided" },
    reason: parsed.data.reason,
  });
  return { ok: true, message: "Payment cancelled." };
}

export const collectionSchema = z
  .object({
    name: z.string().trim().min(3, "Give the project a name.").max(120),
    description: z.string().trim().min(3, "State the project's purpose.").max(300),
    scope: z.string().min(1, "Choose the scope."),
    executiveAmount: francs("Enter the amount for executives."),
    memberAmount: francs("Enter the amount for members."),
    startsOn: z.iso.date("Enter a start date."),
    endsOn: z.union([z.literal(""), z.iso.date("Enter a valid end date.")]).optional(),
  })
  .refine((v) => v.executiveAmount > 0 || v.memberAmount > 0, { message: "Set an amount for executives, members or both.", path: ["memberAmount"] });

/**
 * Sets up a project (collection) and what each executive and each ordinary
 * member is expected to pay. Projects belong to the body that sets them up:
 * MANAGE_COLLECTIONS must be held at exactly the chosen scope (a chapter's
 * Financial Secretary for the chapter, a Regional Coordinator for the region,
 * the National Financial Secretary for the whole organisation).
 */
export function createCollection(actor: Actor, raw: unknown): CommandResult {
  const parsed = collectionSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const scope = parseScope(input.scope);
  if (!scope) return fail("Choose the scope.", { scope: "Unknown scope." });
  if (!canAtExactly(actor, "MANAGE_COLLECTIONS", scope)) return fail(DENIED);
  if (input.endsOn && input.endsOn < input.startsOn) return fail("The end date is before the start date.", { endsOn: "Before the start date." });
  const d = db();
  if (d.collections.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
    return fail("A project with this name already exists.", { name: "Already exists." });
  }

  const id = newId("col");
  d.collections.push({
    id,
    name: input.name,
    description: input.description,
    scope,
    expected: { executive: input.executiveAmount, member: input.memberAmount },
    startsOn: `${input.startsOn}T10:00:00Z`,
    endsOn: input.endsOn ? `${input.endsOn}T10:00:00Z` : undefined,
    createdBy: actor.member.id,
    createdAt: new Date().toISOString(),
  });
  recordAudit(actor, {
    action: "CREATE",
    entityType: "collection",
    entityId: id,
    chapterId: scope.level === "chapter" ? scope.chapterId : null,
    regionId: scope.level === "region" ? scope.regionId : null,
    summary: `New project “${input.name}” (${scopeLabel(scope)}) — executives ${formatMoney(input.executiveAmount)}, members ${formatMoney(input.memberAmount)}`,
    newValues: { name: input.name, scope, expected: { executive: input.executiveAmount, member: input.memberAmount } },
  });
  return { ok: true, message: `“${input.name}” is set up. Financial Secretaries can now record contributions towards it.` };
}

/* ── Expenses (money out) ───────────────────────────────────────────── */

export const expenseSchema = z.object({
  scope: z.string().min(1, "Choose whose funds were used."),
  description: z.string().trim().min(3, "Say what the money was spent on.").max(200),
  paidTo: z.string().trim().max(120).optional().default(""),
  amount: francs("Enter the amount spent").refine((n) => n > 0, "Must be greater than zero."),
  spentOn: z.iso.date("Enter the date spent."),
});

/**
 * Records money taken out of a chapter's, a region's or the central funds
 * (e.g. refreshments for a meeting). Only the keeper of those funds may do
 * so: RECORD_EXPENSE held at exactly that scope.
 */
export function recordExpense(actor: Actor, raw: unknown): CommandResult {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const scope = parseScope(input.scope);
  if (!scope) return fail("Choose whose funds were used.", { scope: "Unknown." });
  if (!canAtExactly(actor, "RECORD_EXPENSE", scope)) return fail(DENIED);
  if (input.spentOn > watToday()) return fail("The date cannot be in the future.", { spentOn: "Date is in the future." });

  const d = db();
  const id = newId("ex");
  const reference = nextReference("PV");
  d.expenses.push({
    id,
    scope,
    description: input.description,
    paidTo: input.paidTo || undefined,
    amount: input.amount,
    currency: "XAF",
    spentOn: `${input.spentOn}T12:00:00Z`,
    reference,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: new Date().toISOString(),
  });
  recordAudit(actor, {
    action: "CREATE",
    entityType: "expense",
    entityId: id,
    chapterId: scope.level === "chapter" ? scope.chapterId : null,
    regionId: scope.level === "region" ? scope.regionId : scope.level === "organization" ? null : undefined,
    summary: `Recorded expense of ${formatMoney(input.amount)} — ${input.description} (${scopeLabel(scope)}) — ${reference}`,
    newValues: { amount: input.amount, description: input.description, paidTo: input.paidTo || null, reference },
  });
  return { ok: true, message: `Recorded ${formatMoney(input.amount)} spent. Voucher ${reference}.` };
}

export function voidExpense(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({ id: z.string().min(1), reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300) })
    .safeParse(raw);
  if (!parsed.success) return fail("Give a reason.", fieldErrorsFrom(parsed.error));
  const row = db().expenses.find((e) => e.id === parsed.data.id);
  if (!row) return fail("Record not found.");
  if (!canAtExactly(actor, "RECORD_EXPENSE", row.scope)) return fail(DENIED);
  if (row.status === "voided") return fail("Already cancelled.");
  row.status = "voided";
  row.voidedBy = actor.member.id;
  row.voidedAt = new Date().toISOString();
  row.voidReason = parsed.data.reason;
  if (row.sentFor) sendProjectMoneyVoidNotice(row);
  recordAudit(actor, {
    action: "VOID",
    entityType: "expense",
    entityId: row.id,
    chapterId: row.scope.level === "chapter" ? row.scope.chapterId : null,
    regionId: row.scope.level === "region" ? row.scope.regionId : row.scope.level === "organization" ? null : undefined,
    summary: `Cancelled expense ${row.reference} of ${formatMoney(row.amount)}`,
    oldValues: { status: "recorded" },
    newValues: { status: "voided" },
    reason: parsed.data.reason,
  });
  return { ok: true, message: "Expense cancelled." };
}

/* ── Roles ──────────────────────────────────────────────────────────── */

export function assignRole(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({ memberId: z.string().min(1, "Choose a member."), roleKey: z.string().min(1, "Choose a role."), regionId: z.string().optional().default("") })
    .safeParse(raw);
  if (!parsed.success) return fail("Please choose a member and a role.", fieldErrorsFrom(parsed.error));

  const d = db();
  const member = d.members.find((m) => m.id === parsed.data.memberId && m.status === "active");
  const role = roleByKey.get(parsed.data.roleKey);
  const chapterId = member ? currentChapterId(member.id) : null;
  if (!member || !role || !chapterId) return fail("Member or role not found.");

  // The scope: the member's chapter for a chapter role, the chosen region for a regional one, or the organisation.
  const chapter = d.chapters.find((c) => c.id === chapterId)!;
  let scope: Scope;
  if (role.scopeLevel === "chapter") scope = { level: "chapter", chapterId };
  else if (role.scopeLevel === "region") {
    const regionId = parsed.data.regionId;
    if (!regionId || !d.regions.some((r) => r.id === regionId)) return fail("Choose the region.", { regionId: "Choose the region." });
    scope = { level: "region", regionId };
  } else scope = { level: "organization" };

  const decision = canAssignRole(actor, { targetMemberId: member.id, targetChapterId: chapterId, roleKey: role.key, scope }, org());
  if (!decision.ok) return fail(decision.reason);

  // One person, one post: their current post must be uplifted first.
  const post = currentPost(member.id);
  if (post) {
    return fail(`${member.fullName} holds ${post.label}. Uplift that post first.`, {
      memberId: "Already holds a post.",
    });
  }

  // One post, one holder: whoever holds it now is uplifted first.
  const holder = d.assignments.find((a) => a.status === "active" && a.roleKey === role.key && JSON.stringify(a.scope) === JSON.stringify(scope));
  if (holder) return fail(`${memberNameOf(holder.memberId)} holds this post. Uplift them first.`, { roleKey: "Post taken." });

  const id = newId("ra");
  d.assignments.push({
    id,
    memberId: member.id,
    roleKey: role.key,
    scope,
    status: "active",
    assignedBy: actor.member.id,
    assignedAt: new Date().toISOString(),
    endedAt: null,
    endedBy: null,
  });
  recordAudit(actor, {
    action: "ASSIGN_ROLE",
    entityType: "role_assignment",
    entityId: id,
    chapterId: scope.level === "chapter" ? scope.chapterId : null,
    regionId: scope.level === "region" ? scope.regionId : scope.level === "chapter" ? chapter.regionId : null,
    summary: `Assigned ${role.name} (${scopeLabel(scope)}) to ${member.fullName}`,
    newValues: { member: member.id, role: role.key, scope },
  });
  return { ok: true, message: `${member.fullName} is now ${role.name} — ${scopeLabel(scope)}. Their access changed immediately.` };
}

export function endRole(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({ assignmentId: z.string().min(1), reason: z.string().trim().min(3, "Give a short reason.").max(300) })
    .safeParse(raw);
  if (!parsed.success) return fail("A reason is required.", fieldErrorsFrom(parsed.error));

  const a = db().assignments.find((x) => x.id === parsed.data.assignmentId);
  if (!a) return fail("Role assignment not found.");
  const decision = canEndRole(actor, a, org());
  if (!decision.ok) return fail(decision.reason);

  a.status = "ended";
  a.endedAt = new Date().toISOString();
  a.endedBy = actor.member.id;
  a.endReason = parsed.data.reason;
  const name = db().members.find((m) => m.id === a.memberId)?.fullName ?? "member";
  recordAudit(actor, {
    action: "REMOVE_ROLE",
    entityType: "role_assignment",
    entityId: a.id,
    chapterId: a.scope.level === "chapter" ? a.scope.chapterId : null,
    regionId: a.scope.level === "region" ? a.scope.regionId : undefined,
    summary: `Ended ${roleName(a.roleKey)} (${scopeLabel(a.scope)}) for ${name}`,
    oldValues: { status: "active" },
    newValues: { status: "ended" },
    reason: parsed.data.reason,
  });
  return { ok: true, message: `${roleName(a.roleKey)} ended for ${name}. The permissions were removed immediately; the history is kept.` };
}

/* ── Yearly registration ─────────────────────────────────────────────── */

export const renewalSchema = z.object({
  year: z.coerce.number({ message: "Enter the year." }).int().min(2000, "Enter a valid year.").max(2100, "Enter a valid year."),
  confirm: z.literal("on", { message: "Confirm that every account becomes inactive until it is paid." }),
});

/**
 * Starts the yearly registration renewal (President General). From now on
 * everyone is inactive until their registration for the year is paid at
 * their chapter, at the chapter's fee; Financial Secretaries record the
 * payments, and accounts reactivate automatically.
 */
export function startRegistrationRenewal(actor: Actor, raw: unknown): CommandResult {
  if (!can(actor, "MANAGE_REGISTRATION", { organization: true }, org())) return fail(DENIED);
  const parsed = renewalSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const { year } = parsed.data;
  const d = db();
  d.renewals ??= [];
  if (d.renewals.some((r) => r.year === year)) return fail(`A registration renewal for ${year} has already been started.`, { year: "Already started." });
  const now = new Date().toISOString();
  const id = newId("rr");
  d.renewals.push({ id, year, openedBy: actor.member.id, openedAt: now });
  d.notifications.push({
    id: newId("nt"),
    type: "announcement",
    title: `Registration ${year} has started`,
    body: `Every membership must be renewed for ${year}. Pay your chapter's registration fee to its Financial Secretary. Your account is inactive until it is recorded, then reactivates automatically.`,
    audience: { kind: "scope", scope: { level: "organization" } },
    createdBy: actor.member.id,
    createdAt: now,
  });
  recordAudit(actor, {
    action: "CREATE",
    entityType: "registration_renewal",
    entityId: id,
    chapterId: null,
    regionId: null,
    summary: `Started Registration ${year}`,
    newValues: { year },
  });
  return {
    ok: true,
    message: `Registration ${year} started.`,
  };
}

/**
 * Undoes the current renewal (e.g. started by mistake): everyone is active
 * again. Payments already recorded stay, under the "Registration <year>" project.
 */
export function cancelRegistrationRenewal(actor: Actor, raw: unknown): CommandResult {
  if (!can(actor, "MANAGE_REGISTRATION", { organization: true }, org())) return fail(DENIED);
  const parsed = z.object({ reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(300) }).safeParse(raw);
  if (!parsed.success) return fail("A reason is required.", fieldErrorsFrom(parsed.error));
  const d = db();
  const renewal = d.renewals?.at(-1);
  if (!renewal) return fail("No registration renewal is in progress.");
  d.renewals = d.renewals!.slice(0, -1);
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "registration_renewal",
    entityId: renewal.id,
    chapterId: null,
    regionId: null,
    summary: `Cancelled Registration ${renewal.year}`,
    oldValues: { year: renewal.year },
    reason: parsed.data.reason,
  });
  return { ok: true, message: `Registration ${renewal.year} cancelled.` };
}

/* ── Own details ─────────────────────────────────────────────────────── */

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: phoneSchema.optional().default(""),
  /** Required only when the email (the sign-in address) changes. */
  currentPassword: z.string().optional().default(""),
});

/**
 * A member updates their own name, email and phone. Their ID and membership
 * number never change. Changing the email changes how they sign in, so it
 * needs their current password. In production the new email is also changed
 * in Supabase Auth (with a confirmation email).
 */
export function updateProfile(actor: Actor, raw: unknown): CommandResult {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();
  const me = d.members.find((m) => m.id === actor.member.id)!;
  const emailChanged = input.email !== me.email.toLowerCase();
  if (emailChanged) {
    if (d.members.some((m) => m.id !== me.id && m.email.toLowerCase() === input.email)) {
      return fail("Another member already uses this email.", { email: "Already in use." });
    }
    if (!input.currentPassword) return fail("Enter your current password to change your email.", { currentPassword: "Needed to change your email." });
    if (!passwordMatches(me.id, input.currentPassword)) return fail("Your current password is not correct.", { currentPassword: "Not correct." });
  }

  const before = { fullName: me.fullName, email: me.email, phone: me.phone ?? "" };
  const after = { fullName: input.fullName, email: input.email, phone: input.phone };
  const changed = (Object.keys(after) as Array<keyof typeof after>).filter((k) => before[k] !== after[k]);
  if (changed.length === 0) return { ok: true, message: "Nothing to change — your details are as they were." };

  me.fullName = input.fullName;
  me.email = input.email;
  me.phone = input.phone || undefined;
  // Demo sign-in shortcuts follow the new email.
  for (const a of d.accounts) if (a.memberId === me.id) a.email = input.email;

  recordAudit(actor, {
    action: "UPDATE",
    entityType: "member",
    entityId: me.id,
    chapterId: actor.chapterId,
    summary: `${input.fullName} updated their ${changed.map((k) => ({ fullName: "name", email: "email", phone: "phone" })[k]).join(", ")}`,
    oldValues: Object.fromEntries(changed.map((k) => [k, before[k]])),
    newValues: Object.fromEntries(changed.map((k) => [k, after[k]])),
  });
  return { ok: true, message: emailChanged ? `Your details were saved. Sign in with ${input.email} from now on.` : "Your details were saved." };
}

/* ── Own password ────────────────────────────────────────────────────── */

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: passwordRule,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The passwords do not match.", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password different from the current one.", path: ["next"] });

/** A member changes their own password (their current one is required). */
export function changePassword(actor: Actor, raw: unknown): CommandResult {
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  if (!passwordMatches(actor.member.id, parsed.data.current)) return fail("Your current password is not correct.", { current: "Not correct." });
  setMemberPassword(actor.member.id, parsed.data.next, { temporary: false, setBy: actor.member.id });
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "credential",
    entityId: actor.member.id,
    chapterId: actor.chapterId,
    summary: `${actor.member.fullName} changed their password`,
  });
  return { ok: true, message: "Your password has been changed. Use it the next time you sign in." };
}

/* ── Members (controlled enrolment) ─────────────────────────────────── */

export const newMemberSchema = z.object({
  fullName: z.string().trim().min(3, "Enter the member’s full name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: phoneSchema.optional(),
  chapterId: z.string().min(1, "Choose a chapter."),
  /** Temporary password; the member changes it on their profile. */
  password: passwordRule,
});

export function createMember(actor: Actor, raw: unknown): CommandResult {
  const parsed = newMemberSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();

  if (!d.chapters.some((c) => c.id === input.chapterId)) return fail("Chapter not found.");
  if (!can(actor, "CREATE_MEMBER", { chapterId: input.chapterId }, org())) return fail(DENIED);
  if (d.members.some((m) => m.email.toLowerCase() === input.email)) {
    return fail("A member with this email already exists.", { email: "Already in use." });
  }
  const fee = chapterFee(input.chapterId);
  if (!fee) return fail("Set the chapter's registration amount first (on this page), then register members.", { chapterId: "Registration amount not set." });

  const id = newId("mem");
  const now = new Date().toISOString();
  const chapter = d.chapters.find((c) => c.id === input.chapterId)!;
  const count = d.affiliations.filter((a) => a.chapterId === chapter.id).length + 1;
  d.members.push({
    id,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone || undefined,
    memberNumber: `DEMO-${chapter.id.replace("ch_", "").toUpperCase()}-${String(100 + count)}`,
    status: "active",
    joinedAt: now,
    createdBy: actor.member.id,
    createdAt: now,
  });
  d.affiliations.push({ id: newId("aff"), memberId: id, chapterId: chapter.id, startedAt: now, endedAt: null, recordedBy: actor.member.id });
  setMemberPassword(id, input.password, { temporary: true, setBy: actor.member.id });
  // The registration fee, paid in full: a receipted contribution in the chapter's books.
  const year = registrationYear();
  const receipt = nextReference("RC");
  d.contributions.push({
    id: newId("ct"),
    ledger: "chapter",
    memberId: id,
    chapterId: chapter.id,
    type: "contribution",
    registrationFee: { year },
    description: `Registration fee ${year}`,
    expectedAmount: fee,
    amount: fee,
    currency: "XAF",
    receivedOn: `${watToday()}T12:00:00Z`,
    reference: receipt,
    status: "recorded",
    recordedBy: actor.member.id,
    recordedAt: now,
  });
  sendReceipt(d.contributions.at(-1)!);
  recordAudit(actor, {
    action: "CREATE",
    entityType: "member",
    entityId: id,
    chapterId: chapter.id,
    summary: `Created member account for ${input.fullName} in ${chapter.name} — registration fee ${formatMoney(fee)} (${receipt})`,
    newValues: { fullName: input.fullName, email: input.email, chapter: chapter.id, registrationFee: fee, receipt },
  });
  return {
    ok: true,
    message: `${input.fullName} registered. Receipt ${receipt}.`,
  };
}

export const statusSchema = z.object({
  memberId: z.string().min(1),
  status: z.enum(["suspended", "active"], { message: "Choose suspend or reinstate." }),
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500),
});

/**
 * Suspends or reinstates a member. A suspended member cannot sign in and
 * holds no permissions; their roles and history are kept untouched, so
 * reinstating restores their access exactly as it was.
 */
export function setMemberStatus(actor: Actor, raw: unknown): CommandResult {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();

  const member = d.members.find((m) => m.id === input.memberId);
  const chapterId = member ? currentChapterId(member.id) : null;
  if (!member || !chapterId) return fail("Member not found.");
  const roleKeys = d.assignments.filter((a) => a.memberId === member.id && a.status === "active").map((a) => a.roleKey);

  const decision = canChangeMemberStatus(actor, { targetMemberId: member.id, targetChapterId: chapterId, targetRoleKeys: roleKeys }, org());
  if (!decision.ok) return fail(decision.reason);
  if (member.status === input.status) {
    return fail(input.status === "suspended" ? "This member is already suspended." : "This member is already active.");
  }

  const old = { status: member.status };
  member.status = input.status;
  member.statusChange = { by: actor.member.id, at: new Date().toISOString(), reason: input.reason };
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "member_status",
    entityId: member.id,
    chapterId,
    summary: `${input.status === "suspended" ? "Suspended" : "Reinstated"} ${member.fullName}`,
    oldValues: old,
    newValues: { status: input.status },
    reason: input.reason,
  });

  if (input.status === "active") {
    d.notifications.push({
      id: newId("nt"),
      type: "announcement",
      title: "Your membership has been reinstated",
      body: `Welcome back. Your NCUDA membership was reinstated by ${actor.member.fullName}.`,
      audience: { kind: "member", memberId: member.id },
      createdBy: actor.member.id,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ok: true,
    message:
      input.status === "suspended"
        ? `${member.fullName} has been suspended. They can no longer sign in; their records and offices are kept.`
        : `${member.fullName} has been reinstated and can sign in again.`,
  };
}

/* ── Meetings ───────────────────────────────────────────────────────── */

const ATTENDANCE: AttendanceStatus[] = ["present", "absent", "excused", "late"];

export function recordAttendance(actor: Actor, meetingId: string, entries: Record<string, string>): CommandResult {
  const d = db();
  const meeting = d.meetings.find((m) => m.id === meetingId);
  if (!meeting) return fail("Meeting not found.");
  if (!runsMeeting(actor, "RECORD_ATTENDANCE", meeting)) return fail(DENIED);
  if (meeting.status === "cancelled") return fail("This meeting was cancelled.");
  if (new Date(meeting.startsAt) > new Date()) return fail("Attendance can only be recorded once the meeting has started.");

  // The roll: the people the meeting is for (each recorded against their chapter).
  const roll = new Set(meetingInvitees(meeting).map((m) => m.id));
  let changed = 0;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};

  for (const [memberId, status] of Object.entries(entries)) {
    if (!ATTENDANCE.includes(status as AttendanceStatus)) continue;
    const chapterId = currentChapterId(memberId);
    if (!roll.has(memberId) || !chapterId) continue; // only the meeting's roll
    const existing = d.attendance.find((a) => a.meetingId === meetingId && a.memberId === memberId);
    if (existing?.status === status) continue;
    before[memberId] = existing?.status ?? "—";
    after[memberId] = status;
    if (existing) {
      existing.status = status as AttendanceStatus;
      existing.recordedBy = actor.member.id;
      existing.recordedAt = new Date().toISOString();
    } else {
      d.attendance.push({
        id: newId("at"),
        meetingId,
        memberId,
        chapterId,
        status: status as AttendanceStatus,
        recordedBy: actor.member.id,
        recordedAt: new Date().toISOString(),
      });
    }
    changed++;
  }

  if (changed === 0) return { ok: true, message: "No changes to save." };
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "attendance",
    entityId: meetingId,
    chapterId: meeting.scope.level === "chapter" ? meeting.scope.chapterId : null,
    regionId: meeting.scope.level === "region" ? meeting.scope.regionId : meeting.scope.level === "organization" ? null : undefined,
    summary: `Updated attendance for ${changed} member${changed === 1 ? "" : "s"} — ${meeting.title}`,
    oldValues: before,
    newValues: after,
  });
  return { ok: true, message: `Attendance saved for ${changed} member${changed === 1 ? "" : "s"}.` };
}

export function completeActionItem(actor: Actor, id: string): CommandResult {
  const d = db();
  const item = d.actionItems.find((a) => a.id === id);
  const meeting = item && d.meetings.find((m) => m.id === item.meetingId);
  if (!item || !meeting) return fail("Action item not found.");
  // Marked done by the Secretary who recorded it (the Regional Coordinator, the National Secretary General) — not by the person responsible.
  if (!runsMeeting(actor, "COMPLETE_ACTION_ITEM", meeting)) return fail("Action items are marked complete by the Secretary.");
  if (item.status === "completed") return fail("Already completed.");

  const old = item.status;
  item.status = "completed";
  item.completedAt = new Date().toISOString();
  item.completedBy = actor.member.id;
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "action_item",
    entityId: id,
    chapterId: meeting.scope.level === "chapter" ? meeting.scope.chapterId : null,
    regionId: meeting.scope.level === "region" ? meeting.scope.regionId : undefined,
    summary: `Completed action item “${item.title}”`,
    oldValues: { status: old },
    newValues: { status: "completed" },
  });
  return { ok: true, message: "Marked as completed." };
}

/* ── Notifications & messages ─────────────────────────────────────── */

export function markNotificationsRead(actor: Actor, ids: string[]) {
  const d = db();
  const now = new Date().toISOString();
  for (const id of ids) {
    const n = d.notifications.find((x) => x.id === id);
    if (!n || !notificationVisible(actor, n)) continue; // only your own inbox
    if (!d.notificationReads.some((r) => r.notificationId === id && r.memberId === actor.member.id)) {
      d.notificationReads.push({ notificationId: id, memberId: actor.member.id, readAt: now });
    }
  }
}

function parseScope(value: string): Scope | null {
  if (value === "organization") return { level: "organization" };
  const [level, id] = value.split(":");
  if (level === "region" && db().regions.some((r) => r.id === id)) return { level: "region", regionId: id };
  if (level === "chapter" && db().chapters.some((c) => c.id === id)) return { level: "chapter", chapterId: id };
  return null;
}

export const messageSchema = z.object({
  scope: z.string().min(1, "Choose who should receive this."),
  roleKeys: z.array(z.string()).default([]),
  title: z.string().trim().min(3, "Add a subject.").max(140),
  body: z.string().trim().min(5, "Write your message.").max(4000),
});

/** Stores an uploaded file as a document record (bytes kept in the demo file store). */
export function storeDocument(
  actor: Actor,
  file: IncomingFile,
  opts: { title: string; category: DocumentCategory; scope: Scope; roleKeys: string[]; attachment: boolean },
) {
  const id = newId("doc");
  const filename = safeFilename(file.name);
  db().documents.push({
    id,
    title: opts.title,
    filename,
    category: opts.category,
    storagePath: `${id}/${filename}`,
    sizeBytes: file.size,
    mimeType: file.type,
    scope: opts.scope,
    roleKeys: opts.roleKeys.length ? opts.roleKeys : undefined,
    attachment: opts.attachment || undefined,
    uploadedBy: actor.member.id,
    uploadedAt: new Date().toISOString(),
  });
  putFile(id, file.bytes, file.type);
  recordAudit(actor, {
    action: "UPLOAD",
    entityType: "document",
    entityId: id,
    chapterId: opts.scope.level === "chapter" ? opts.scope.chapterId : null,
    regionId: opts.scope.level === "region" ? opts.scope.regionId : null,
    summary: `${opts.attachment ? "Attached" : "Uploaded"} “${filename}”`,
    newValues: { scope: opts.scope, roleKeys: opts.roleKeys, category: opts.category },
  });
  return id;
}

/**
 * Sends a message to everyone in a scope, or only to holders of selected
 * roles within it (e.g. all Chapter Presidents). Requires
 * MANAGE_NOTIFICATIONS over that scope. Up to five files may be attached;
 * attachments can be opened by exactly the people who can see the message.
 */
export function sendMessage(actor: Actor, raw: unknown, files: IncomingFile[] = []): CommandResult {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;

  const scope = parseScope(input.scope);
  if (!scope) return fail("Choose who should receive this.", { scope: "Unknown group." });
  if (!canIn(actor, "MANAGE_NOTIFICATIONS", scope)) return fail(DENIED);
  if (input.roleKeys.some((k) => !roleByKey.has(k))) return fail("Unknown role selected.");
  if (files.length > MAX_ATTACHMENTS) return fail(`Attach at most ${MAX_ATTACHMENTS} files.`, { attachments: "Too many files." });
  for (const f of files) {
    const problem = checkFile(f);
    if (problem) return fail(problem, { attachments: problem });
  }

  const audience: NotificationRecord["audience"] =
    input.roleKeys.length > 0 ? { kind: "group", scope, roleKeys: input.roleKeys } : { kind: "scope", scope };
  const recipients = recipientsOf(audience).filter((m) => m.id !== actor.member.id);
  if (recipients.length === 0) return fail("Nobody currently matches that group, so the message was not sent.");

  const attachmentIds = files.map((f) =>
    storeDocument(actor, f, { title: f.name, category: "other", scope, roleKeys: input.roleKeys, attachment: true }),
  );

  const id = newId("nt");
  db().notifications.push({
    id,
    type: "message",
    title: input.title,
    body: input.body,
    audience,
    attachmentIds: attachmentIds.length ? attachmentIds : undefined,
    createdBy: actor.member.id,
    createdAt: new Date().toISOString(),
  });
  const n = recipients.length;
  recordAudit(actor, {
    action: "CREATE",
    entityType: "notification",
    entityId: id,
    chapterId: scope.level === "chapter" ? scope.chapterId : null,
    regionId: scope.level === "region" ? scope.regionId : null,
    summary: `Sent “${input.title}” to ${audienceLabel(audience)} (${n} recipient${n === 1 ? "" : "s"}${attachmentIds.length ? `, ${attachmentIds.length} attachment${attachmentIds.length === 1 ? "" : "s"}` : ""})`,
    newValues: { audience, attachmentIds },
  });
  return { ok: true, message: `Message sent to ${n} member${n === 1 ? "" : "s"}.` };
}

export const uploadSchema = z.object({
  title: z.string().trim().min(3, "Give the document a title.").max(160),
  category: z.enum(["minutes", "association", "reports", "financial", "forms", "other"], { message: "Choose a category." }),
  scope: z.string().min(1, "Choose who can view it."),
  roleKeys: z.array(z.string()).default([]),
});

/**
 * Uploads a document and shares it with the chosen people: everyone in a
 * scope, or only holders of selected offices within it. Everyone it is
 * shared with is notified and finds it on their Public Relations page.
 */
export function uploadDocument(actor: Actor, raw: unknown, file: IncomingFile | undefined): CommandResult {
  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  if (!file) return fail("Choose a file to upload.", { file: "Choose a file." });
  const problem = checkFile(file);
  if (problem) return fail(problem, { file: problem });

  const scope = parseScope(input.scope);
  if (!scope) return fail("Choose who can view it.", { scope: "Unknown group." });
  if (!canIn(actor, "UPLOAD_DOCUMENT", scope)) return fail(DENIED);
  if (input.roleKeys.some((k) => !roleByKey.has(k))) return fail("Unknown role selected.");

  const audience: NotificationRecord["audience"] =
    input.roleKeys.length > 0 ? { kind: "group", scope, roleKeys: input.roleKeys } : { kind: "scope", scope };
  const recipients = recipientsOf(audience).filter((m) => m.id !== actor.member.id);

  storeDocument(actor, file, { title: input.title, category: input.category, scope, roleKeys: input.roleKeys, attachment: false });

  if (recipients.length > 0) {
    db().notifications.push({
      id: newId("nt"),
      type: "document_uploaded",
      title: `New document: ${input.title}`,
      body: `${actor.member.fullName} shared “${input.title}” with ${audienceLabel(audience)}. You can view and download it on the Public Relations page.`,
      audience,
      link: "/dashboard/public-relations",
      createdBy: actor.member.id,
      createdAt: new Date().toISOString(),
    });
  }
  const n = recipients.length;
  return {
    ok: true,
    message: n
      ? `“${input.title}” was shared with ${n} member${n === 1 ? ", who has" : "s, who have"} been notified.`
      : `“${input.title}” was uploaded. Nobody else currently matches that group.`,
  };
}

export const forwardSchema = z.object({
  notificationId: z.string().min(1),
  scope: z.string().min(1, "Choose who should receive this."),
  roleKeys: z.array(z.string()).default([]),
  note: z.string().trim().max(500, "Keep your note under 500 characters.").optional().default(""),
});

/**
 * Forwards a message "as received" down the chain of authority. The subject
 * and text are copied unchanged; the forwarder may add a separate note.
 * Rules: you must have received the message, you may only forward to people
 * within your own MANAGE_NOTIFICATIONS scope, and people who already have the
 * message are not sent it again.
 */
export function forwardMessage(actor: Actor, raw: unknown): CommandResult {
  const parsed = forwardSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();

  const received = d.notifications.find((n) => n.id === input.notificationId);
  // Not received and not existing look the same.
  if (!received || !notificationVisible(actor, received)) return fail("Message not found.");
  if (!FORWARDABLE_TYPES.includes(received.type)) return fail("Only messages and announcements can be forwarded.");

  const scope = parseScope(input.scope);
  if (!scope) return fail("Choose who should receive this.", { scope: "Unknown group." });
  if (!canIn(actor, "MANAGE_NOTIFICATIONS", scope)) return fail(DENIED);
  if (input.roleKeys.some((k) => !roleByKey.has(k))) return fail("Unknown role selected.");

  const audience: NotificationRecord["audience"] =
    input.roleKeys.length > 0 ? { kind: "group", scope, roleKeys: input.roleKeys } : { kind: "scope", scope };

  const originalId = rootId(received);
  const original = d.notifications.find((n) => n.id === originalId) ?? received;
  const alreadyHave = holdersOf(originalId);
  const newRecipients = recipientsOf(audience).filter((m) => m.id !== actor.member.id && !alreadyHave.has(m.id));
  if (newRecipients.length === 0) return fail("Everyone in that group has already received this message.");

  const id = newId("nt");
  d.notifications.push({
    id,
    type: original.type,
    title: original.title, // as received — never edited
    body: original.body,
    audience,
    link: original.link,
    attachmentIds: original.attachmentIds,
    createdBy: actor.member.id,
    createdAt: new Date().toISOString(),
    forward: {
      originalId,
      originalSenderId: original.createdBy,
      originalSentAt: original.createdAt,
      via: received.forward ? [...received.forward.via, ...(received.createdBy ? [received.createdBy] : [])] : [],
      note: input.note || undefined,
    },
  });
  const n = newRecipients.length;
  recordAudit(actor, {
    action: "CREATE",
    entityType: "notification",
    entityId: id,
    chapterId: scope.level === "chapter" ? scope.chapterId : null,
    regionId: scope.level === "region" ? scope.regionId : null,
    summary: `Forwarded “${original.title}” (from ${memberNameOf(original.createdBy)}) to ${audienceLabel(audience)} (${n} new recipient${n === 1 ? "" : "s"})`,
    newValues: { forwardedFrom: received.id, originalId, audience, note: input.note || null },
  });
  return { ok: true, message: `Forwarded to ${n} member${n === 1 ? "" : "s"}.` };
}

/* ── Chapters ───────────────────────────────────────────────────────── */

/** EXCO offices that can be filled when a chapter is created. */
export const INITIAL_EXCO_ROLES = [
  "CHAPTER_PRESIDENT",
  "CHAPTER_VICE_PRESIDENT",
  "CHAPTER_SECRETARY",
  "FINANCIAL_SECRETARY",
  "TREASURER",
] as const;

const excoPerson = z.object({
  fullName: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().toLowerCase().max(200).optional().default(""),
  phone: phoneSchema.optional().default(""),
  password: z.string().optional().default(""),
});

/** A temporary password's error message, or null if it is acceptable. */
const passwordProblem = (pw: string) => (pw ? (passwordRule.safeParse(pw).error?.issues[0]?.message ?? null) : "Set a temporary password for them.");

/**
 * The person who will lead a new region or chapter: either someone already in
 * the portal ("existing") or a new person whose account is created now ("new").
 */
const appointeeSchema = z.object({
  mode: z.enum(["existing", "new"]).default("new"),
  memberId: z.string().optional().default(""),
  fullName: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().toLowerCase().max(200).optional().default(""),
  phone: phoneSchema.optional().default(""),
  /** A new person's temporary password (they change it on their profile). */
  password: z.string().optional().default(""),
});
type Appointee = z.infer<typeof appointeeSchema>;

/**
 * Validates an appointee. Returns field errors (keyed `${prefix}.field`), or
 * the member to appoint / the new person to create.
 */
function checkAppointee(
  actor: Actor,
  a: Appointee,
  prefix: string,
  eligible: (memberId: string) => boolean,
  takenEmails: Set<string> = new Set(),
): { errors: Record<string, string> } | { existing: Member } | { person: { fullName: string; email: string; phone: string; password: string } } {
  const d = db();
  if (a.mode === "existing") {
    const m = d.members.find((x) => x.id === a.memberId && x.status === "active");
    if (!m) return { errors: { [`${prefix}.memberId`]: "Choose a member." } };
    if (m.id === actor.member.id) return { errors: { [`${prefix}.memberId`]: "You cannot appoint yourself." } };
    const post = currentPost(m.id);
    if (post) return { errors: { [`${prefix}.memberId`]: `${m.fullName} currently holds ${post.label}. One person holds one post — uplift that post first (Roles & access).` } };
    if (!eligible(m.id)) return { errors: { [`${prefix}.memberId`]: "This member cannot be appointed here." } };
    return { existing: m };
  }
  const errors: Record<string, string> = {};
  if (a.fullName.length < 3) errors[`${prefix}.fullName`] = "Enter the full name.";
  if (!z.email().safeParse(a.email).success) errors[`${prefix}.email`] = "Enter a valid email.";
  else if (takenEmails.has(a.email) || d.members.some((m) => m.email.toLowerCase() === a.email)) errors[`${prefix}.email`] = "This email is already in use.";
  const pw = passwordProblem(a.password);
  if (pw) errors[`${prefix}.password`] = pw;
  if (Object.keys(errors).length) return { errors };
  return { person: { fullName: a.fullName, email: a.email, phone: a.phone, password: a.password } };
}

/** Creates a member account with the temporary password their creator chose. */
function addMember(actor: Actor, p: { fullName: string; email: string; phone: string; password: string }, numberPrefix: string) {
  const d = db();
  const now = new Date().toISOString();
  const id = newId("mem");
  d.members.push({
    id,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone || undefined,
    memberNumber: `${numberPrefix}-${String(d.seq).padStart(4, "0")}`,
    status: "active",
    joinedAt: now,
    createdBy: actor.member.id,
    createdAt: now,
  });
  setMemberPassword(id, p.password, { temporary: true, setBy: actor.member.id });
  return id;
}

/** Moves a member into a chapter, closing their previous chapter membership (history is kept). */
function moveIntoChapter(actor: Actor, memberId: string, chapterId: string, note: string) {
  const d = db();
  const now = new Date().toISOString();
  const previous = d.affiliations.find((a) => a.memberId === memberId && a.endedAt === null);
  if (previous) previous.endedAt = now;
  d.affiliations.push({ id: newId("aff"), memberId, chapterId, startedAt: now, endedAt: null, recordedBy: actor.member.id, note });
  if (previous) {
    recordAudit(actor, {
      action: "UPDATE",
      entityType: "chapter_affiliation",
      entityId: memberId,
      chapterId,
      summary: `Moved ${memberNameOf(memberId)} from ${chapterNameOf(previous.chapterId)} to ${chapterNameOf(chapterId)} (${note.toLowerCase()})`,
      oldValues: { chapter: previous.chapterId },
      newValues: { chapter: chapterId },
    });
  }
}

const chapterNameOf = (id: string | null) => db().chapters.find((c) => c.id === id)?.name ?? "no chapter";

const COORDINATOR = "REGIONAL_COORDINATOR";

/** Appoints `memberId` as coordinator of `regionId` (authority already checked). */
function appointCoordinator(actor: Actor, memberId: string, regionId: string) {
  const d = db();
  const id = newId("ra");
  d.assignments.push({
    id,
    memberId,
    roleKey: COORDINATOR,
    scope: { level: "region", regionId },
    status: "active",
    assignedBy: actor.member.id,
    assignedAt: new Date().toISOString(),
    endedAt: null,
    endedBy: null,
  });
  recordAudit(actor, {
    action: "ASSIGN_ROLE",
    entityType: "role_assignment",
    entityId: id,
    chapterId: null,
    regionId,
    summary: `Appointed ${memberNameOf(memberId)} as Regional Coordinator of ${scopeLabel({ level: "region", regionId })}`,
    newValues: { member: memberId, role: COORDINATOR, scope: `region:${regionId}` },
  });
}

/** Resolves the coordinator (existing member or new person) and appoints them. */
function resolveAndAppointCoordinator(actor: Actor, raw: Appointee, regionId: string): CommandResult | null {
  const eligible = new Set(coordinatorCandidates(actor, regionId).map((m) => m.id));
  const who = checkAppointee(actor, raw, "coordinator", (id) => eligible.has(id));
  if ("errors" in who) return fail("Please correct the highlighted fields.", who.errors);
  // A new coordinator is not yet in any chapter; they join one later (e.g. one they create in their region).
  const memberId = "existing" in who ? who.existing.id : addMember(actor, who.person, "NCUDA-RC");
  if ("person" in who) {
    recordAudit(actor, {
      action: "CREATE",
      entityType: "member",
      entityId: memberId,
      chapterId: null,
      regionId,
      summary: `Created an account for ${who.person.fullName} as Regional Coordinator`,
    });
  }
  appointCoordinator(actor, memberId, regionId);
  return null;
}

export const regionSchema = z.object({
  name: z.string().trim().min(2, "Enter the region's name.").max(120),
  coordinator: appointeeSchema,
});

/**
 * Creates a region together with its Regional Coordinator — someone already
 * in the portal (from any chapter) or a new person. President General only
 * (CREATE_REGION). From then on the coordinator creates the region's chapters.
 */
export function createRegion(actor: Actor, raw: unknown): CommandResult {
  if (!can(actor, "CREATE_REGION", { organization: true }, org())) return fail(DENIED);
  const parsed = regionSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const d = db();
  if (d.regions.some((r) => r.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail("A region with this name already exists.", { name: "Already exists." });
  }
  // Validate the coordinator before creating anything. A new region has no chapters, so its coordinator is a new person.
  const eligible = new Set(coordinatorCandidates(actor, null).map((m) => m.id));
  const check = checkAppointee(actor, parsed.data.coordinator, "coordinator", (id) => eligible.has(id));
  if ("errors" in check) return fail("Please correct the highlighted fields.", check.errors);

  const regionId = newId("reg");
  d.regions.push({ id: regionId, name: parsed.data.name });
  recordAudit(actor, { action: "CREATE", entityType: "region", entityId: regionId, chapterId: null, regionId, summary: `Created region ${parsed.data.name}` });
  resolveAndAppointCoordinator(actor, parsed.data.coordinator, regionId);
  return { ok: true, message: `${parsed.data.name} created.` };
}

const currentCoordinator = (regionId: string) =>
  db().assignments.find((a) => a.roleKey === COORDINATOR && a.status === "active" && a.scope.level === "region" && a.scope.regionId === regionId)?.memberId ?? null;

/** Appoints a coordinator to a region that has none (existing member or new person). President General only. */
export function appointRegionCoordinator(actor: Actor, raw: unknown): CommandResult {
  if (!can(actor, "CREATE_REGION", { organization: true }, org())) return fail(DENIED);
  const parsed = z.object({ regionId: z.string().min(1), coordinator: appointeeSchema }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const region = db().regions.find((r) => r.id === parsed.data.regionId);
  if (!region) return fail("Region not found.");
  if (currentCoordinator(region.id)) return fail(`${region.name} already has a Regional Coordinator. End that appointment first (Roles & access).`);
  const failed = resolveAndAppointCoordinator(actor, parsed.data.coordinator, region.id);
  if (failed) return failed;
  return { ok: true, message: `${memberNameOf(currentCoordinator(region.id))} is now Regional Coordinator of ${region.name}.` };
}

/** The President General renames a region. */
export function updateRegion(actor: Actor, raw: unknown): CommandResult {
  if (!can(actor, "CREATE_REGION", { organization: true }, org())) return fail(DENIED);
  const parsed = z.object({ regionId: z.string().min(1), name: z.string().trim().min(2, "Enter the region's name.").max(120) }).safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const d = db();
  const region = d.regions.find((r) => r.id === parsed.data.regionId);
  if (!region) return fail("Region not found.");
  if (d.regions.some((r) => r.id !== region.id && r.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail("Another region already has this name.", { name: "Already used." });
  }
  if (region.name === parsed.data.name) return { ok: true, message: "Nothing to change." };
  const old = region.name;
  region.name = parsed.data.name;
  recordAudit(actor, { action: "UPDATE", entityType: "region", entityId: region.id, chapterId: null, regionId: region.id, summary: `Renamed region ${old} to ${region.name}`, oldValues: { name: old }, newValues: { name: region.name } });
  return { ok: true, message: `Region renamed to ${region.name}.` };
}

/** A chapter's name and location are edited by its region's coordinator (or the President General). */
export function updateChapter(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({
      chapterId: z.string().min(1),
      name: z.string().trim().min(3, "Enter the chapter name.").max(120),
      location: z.string().trim().min(2, "Enter the location.").max(160),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const d = db();
  const chapter = d.chapters.find((c) => c.id === parsed.data.chapterId);
  if (!chapter) return fail("Chapter not found.");
  if (!canEditChapter(actor, chapter)) return fail(DENIED);
  if (d.chapters.some((c) => c.id !== chapter.id && c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return fail("Another chapter already has this name.", { name: "Already used." });
  }
  const before = { name: chapter.name, location: chapter.location };
  const after = { name: parsed.data.name, location: parsed.data.location };
  const changed = (Object.keys(after) as Array<keyof typeof after>).filter((k) => before[k] !== after[k]);
  if (changed.length === 0) return { ok: true, message: "Nothing to change." };
  Object.assign(chapter, after);
  recordAudit(actor, {
    action: "UPDATE",
    entityType: "chapter",
    entityId: chapter.id,
    chapterId: chapter.id,
    summary: `Updated chapter ${chapter.name} (${changed.join(", ")})`,
    oldValues: Object.fromEntries(changed.map((k) => [k, before[k]])),
    newValues: Object.fromEntries(changed.map((k) => [k, after[k]])),
  });
  return { ok: true, message: `${chapter.name} was updated.` };
}

/**
 * Moves a member to another chapter — in the same region or another one
 * (see transferOptions for who may). Their chapter history keeps the old
 * membership; region and organisation posts stay; a chapter post must be
 * ended first (one person, one post).
 */
export function transferMember(actor: Actor, raw: unknown): CommandResult {
  const parsed = z
    .object({ memberId: z.string().min(1), toChapterId: z.string().min(1, "Choose the new chapter."), note: z.string().trim().max(300).optional().default("") })
    .safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const options = transferOptions(actor, parsed.data.memberId);
  if (!options) return fail(DENIED);
  const name = memberNameOf(parsed.data.memberId);
  if (options.blockedBy) {
    return fail(`${name} holds ${options.blockedBy}. Uplift that post first.`);
  }
  if (options.finesOwed > 0) {
    return fail(`${name} owes ${formatMoney(options.finesOwed)} in fines — to be paid before a move.`);
  }
  const to = options.destinations.find((c) => c.id === parsed.data.toChapterId);
  if (!to) return fail("You cannot move this member to that chapter.", { toChapterId: "Not available." });
  moveIntoChapter(actor, parsed.data.memberId, to.id, parsed.data.note || (options.from ? "Transferred" : "Placed in a chapter"));
  if (!options.from) {
    recordAudit(actor, {
      action: "UPDATE",
      entityType: "chapter_affiliation",
      entityId: parsed.data.memberId,
      chapterId: to.id,
      summary: `Placed ${name} in ${to.name}`,
      newValues: { chapter: to.id },
    });
  }
  return { ok: true, message: `${name} is now a member of ${to.name}${options.from ? ` (moved from ${chapterNameOf(options.from)})` : ""}.` };
}

export const chapterSchema = z.object({
  name: z.string().trim().min(3, "Enter the chapter name.").max(120),
  location: z.string().trim().min(2, "Enter where the chapter meets.").max(160),
  regionId: z.string().optional().default(""),
  /** The Chapter President: someone already in the portal, or a new person. */
  president: appointeeSchema.default({ mode: "new", memberId: "", fullName: "", email: "", phone: "", password: "" }),
  /** The Financial Secretary (required: they register the chapter's members). */
  financialSecretary: appointeeSchema.default({ mode: "new", memberId: "", fullName: "", email: "", phone: "", password: "" }),
  /** Other founding officers (new people, all optional). */
  exco: z.record(z.string(), excoPerson).default({}),
});

/**
 * Creates a chapter together with its Chapter President and its Financial
 * Secretary — both required, since the Financial Secretary registers the
 * chapter's members. Each is an existing member (who moves into the new
 * chapter) or a new person. Other founding officers are optional. A region's
 * chapters are created by that region's Regional Coordinator — the only one
 * who creates chapters (see canCreateChapter).
 */
export function createChapter(actor: Actor, raw: unknown): CommandResult {
  if (!hasAnywhere(actor, "CREATE_CHAPTER")) return fail(DENIED);
  const parsed = chapterSchema.safeParse(raw);
  if (!parsed.success) return fail("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const d = db();

  if (d.chapters.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
    return fail("A chapter with this name already exists.", { name: "Already exists." });
  }
  const regionId = input.regionId || null;
  if (!regionId) return fail("Choose the region this chapter belongs to.", { regionId: "Choose a region." });
  if (!d.regions.some((r) => r.id === regionId)) return fail("Region not found.", { regionId: "Unknown region." });
  if (!canCreateChapter(actor, regionId)) {
    return fail("Chapters are created by the Regional Coordinator of their region.", { regionId: "Not your region." });
  }

  // The President and the Financial Secretary: both required, each existing or new.
  const fieldErrors: Record<string, string> = {};
  const emails = new Set<string>();
  const eligible = new Set(chapterPresidentCandidates(actor).map((m) => m.id));
  const founding = (prefix: "president" | "financialSecretary", raw: Appointee) => {
    const who = checkAppointee(actor, raw, prefix, (id) => eligible.has(id), emails);
    if ("errors" in who) Object.assign(fieldErrors, who.errors);
    // Joining a new chapter moves the member into it: unpaid fines are settled first.
    else if ("existing" in who && finesOwedBy(who.existing.id) > 0) {
      fieldErrors[`${prefix}.memberId`] = `${who.existing.fullName} still owes ${formatMoney(finesOwedBy(who.existing.id))} in fines, which must be paid before they can move to another chapter.`;
    } else if ("person" in who) emails.add(who.person.email);
    return who;
  };
  const president = founding("president", input.president);
  const financialSecretary = founding("financialSecretary", input.financialSecretary);
  // One person, one post.
  if ("existing" in president && "existing" in financialSecretary && president.existing.id === financialSecretary.existing.id) {
    fieldErrors["financialSecretary.memberId"] = "The Chapter President and the Financial Secretary must be two different people.";
  }

  // Other founding officers: any filled row needs a name and a valid, unused email.
  const people: Array<{ roleKey: string; fullName: string; email: string; phone: string; password: string }> = [];
  for (const roleKey of INITIAL_EXCO_ROLES) {
    if (roleKey === "CHAPTER_PRESIDENT" || roleKey === "FINANCIAL_SECRETARY") continue;
    const row = input.exco[roleKey] ?? { fullName: "", email: "", phone: "" };
    if (!row.fullName && !row.email && !row.phone) continue;
    if (row.fullName.length < 3) fieldErrors[`exco.${roleKey}.fullName`] = "Enter the full name.";
    const pw = passwordProblem(row.password);
    if (pw) fieldErrors[`exco.${roleKey}.password`] = pw;
    if (!z.email().safeParse(row.email).success) fieldErrors[`exco.${roleKey}.email`] = "Enter a valid email.";
    else if (emails.has(row.email) || d.members.some((m) => m.email.toLowerCase() === row.email)) {
      fieldErrors[`exco.${roleKey}.email`] = "This email is already in use.";
    }
    emails.add(row.email);
    people.push({ roleKey, ...row });
  }
  if (Object.keys(fieldErrors).length || "errors" in president || "errors" in financialSecretary) return fail("Please correct the highlighted fields.", fieldErrors);

  const chapterId = newId("ch");
  d.chapters.push({ id: chapterId, name: input.name, regionId, location: input.location });
  recordAudit(actor, {
    action: "CREATE",
    entityType: "chapter",
    entityId: chapterId,
    chapterId,
    summary: `Created chapter ${input.name} in ${scopeLabel({ level: "region", regionId })}`,
    newValues: { name: input.name, location: input.location, regionId },
  });

  const appoint = (memberId: string, roleKey: string) => {
    const assignmentId = newId("ra");
    d.assignments.push({
      id: assignmentId,
      memberId,
      roleKey,
      scope: { level: "chapter", chapterId },
      status: "active",
      assignedBy: actor.member.id,
      assignedAt: new Date().toISOString(),
      endedAt: null,
      endedBy: null,
    });
    recordAudit(actor, {
      action: "ASSIGN_ROLE",
      entityType: "role_assignment",
      entityId: assignmentId,
      chapterId,
      summary: `Appointed ${memberNameOf(memberId)} as founding ${roleName(roleKey)} of ${input.name}`,
      newValues: { member: memberId, role: roleKey },
    });
  };
  const numberPrefix = `NCUDA-${chapterId.replace("ch_", "").toUpperCase()}`;

  const presidentId = "existing" in president ? president.existing.id : addMember(actor, president.person, numberPrefix);
  moveIntoChapter(actor, presidentId, chapterId, "Founding Chapter President");
  appoint(presidentId, "CHAPTER_PRESIDENT");
  const financialSecretaryId = "existing" in financialSecretary ? financialSecretary.existing.id : addMember(actor, financialSecretary.person, numberPrefix);
  moveIntoChapter(actor, financialSecretaryId, chapterId, "Founding Financial Secretary");
  appoint(financialSecretaryId, "FINANCIAL_SECRETARY");

  for (const p of people) {
    const memberId = addMember(actor, p, numberPrefix);
    moveIntoChapter(actor, memberId, chapterId, "Founding EXCO");
    appoint(memberId, p.roleKey);
  }

  return {
    ok: true,
    message: `${input.name} created.`,
  };
}
