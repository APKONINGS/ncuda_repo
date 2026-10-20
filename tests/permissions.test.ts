import { beforeEach, describe, expect, it } from "vitest";
import { buildActor } from "@/lib/auth/actor";
import { db } from "@/lib/demo/store";
import { can, canAssignRole, hasAnywhere } from "@/lib/permissions/engine";
import * as commands from "@/lib/portal/commands";
import { registrationStanding } from "@/lib/portal/registration";
import * as committees from "@/lib/portal/committees";
import * as meetings from "@/lib/portal/meetings";
import { buildExport } from "@/lib/portal/exports";
import { csvCell, toCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/utils";
import { attendanceRegister, collectionSummaries, currentPost, financialSummary, listChapters, listRegions, getDocumentForDownload, getMeeting, listAudit, listDocuments, listMembers, listNotifications, myContributions, scopedContributions, scopedExpenses, transferOptions, registrationToCollect, registrationDesk, registrationOverview, memberStanding, postAt, listMeetings } from "@/lib/portal/queries";

const g = globalThis as unknown as { __ncudaDemoDB?: unknown };
beforeEach(() => {
  g.__ncudaDemoDB = undefined; // fresh fixtures for every test
});

const actor = (id: string) => {
  const a = buildActor(id);
  if (!a) throw new Error(`no actor ${id}`);
  return a;
};
const org = () => ({ chapters: db().chapters });
const A1 = { chapterId: "ch_a1" };
const B1 = { chapterId: "ch_b1" };

describe("scope", () => {
  it("an ordinary member has no officer permissions", () => {
    const m = actor("mem_member");
    expect(can(m, "VIEW_CONTRIBUTIONS", A1, org())).toBe(false);
    expect(can(m, "VIEW_MEMBER", A1, org())).toBe(false);
    expect(listMembers(m)).toBeNull();
    expect(listAudit(m)).toBeNull();
  });

  it("a Financial Secretary's authority stops at their own chapter", () => {
    const fs = actor("mem_finsec");
    expect(can(fs, "RECORD_CONTRIBUTION", A1, org())).toBe(true);
    expect(can(fs, "RECORD_CONTRIBUTION", B1, org())).toBe(false);
    expect(scopedContributions(fs)!.rows.every((r) => r.chapterId === "ch_a1")).toBe(true);
  });

  it("a region-level role covers only that region's chapters", () => {
    const rc = actor("mem_coord");
    expect(can(rc, "VIEW_MEMBER", A1, org())).toBe(true);
    expect(can(rc, "VIEW_MEMBER", { chapterId: "ch_a2" }, org())).toBe(true);
    expect(can(rc, "VIEW_MEMBER", B1, org())).toBe(false);
    expect(can(rc, "VIEW_MEMBER", { chapterId: "ch_d" }, org())).toBe(false);
  });

  it("a delegation grants exactly what was delegated, where it was delegated", () => {
    const rc = actor("mem_coord");
    expect(can(rc, "VIEW_CONTRIBUTIONS", A1, org())).toBe(true); // delegated for Region A
    expect(can(rc, "VIEW_CONTRIBUTIONS", B1, org())).toBe(false);
    expect(can(rc, "RECORD_CONTRIBUTION", A1, org())).toBe(false);
  });

  it("members cannot see meetings of other chapters (indistinguishable from not found)", () => {
    expect(getMeeting(actor("mem_member"), "mt_7")).toBeNull();
    expect(getMeeting(actor("mem_member"), "does-not-exist")).toBeNull();
  });
});

describe("viewing finances is not editing finances", () => {
  it("Chapter President can view but not record or void", () => {
    const p = actor("mem_cpres");
    expect(can(p, "VIEW_CONTRIBUTIONS", A1, org())).toBe(true);
    expect(can(p, "RECORD_CONTRIBUTION", A1, org())).toBe(false);
    expect(can(p, "VOID_CONTRIBUTION", A1, org())).toBe(false);
  });

  it("President General can view organisation-wide but not record", () => {
    const mp = actor("mem_pg");
    expect(can(mp, "VIEW_CONTRIBUTIONS", B1, org())).toBe(true);
    expect(can(mp, "RECORD_CONTRIBUTION", B1, org())).toBe(false);
  });

  it("a former Financial Secretary has lost financial permissions", () => {
    expect(can(actor("mem_s02"), "RECORD_CONTRIBUTION", A1, org())).toBe(false);
  });
});

describe("finance views, filters and collections", () => {
  it("the President General sees every chapter's records, grouped by chapter with subtotals", () => {
    const view = scopedContributions(actor("mem_pg"))!;
    expect(view.groups.map((g) => g.chapterId).sort()).toEqual(["central", "ch_a1", "ch_a2", "ch_b1", "ch_b2", "ch_d"]);
    expect(view.groups[0].chapterId).toBe("central"); // the central ledger is listed first
    const sum = view.groups.reduce((s, g) => s + g.totals.amount, 0);
    expect(sum).toBe(view.totals.amount);
  });

  it("filters by chapter, collection and date range", () => {
    const pg = actor("mem_pg");
    const tractorInB2 = scopedContributions(pg, { chapterId: "ch_b2", collectionId: "col_tractor" })!;
    expect(tractorInB2.rows.length).toBeGreaterThan(0);
    expect(tractorInB2.rows.every((r) => r.chapterId === "ch_b2" && r.collectionId === "col_tractor")).toBe(true);

    const summer = scopedContributions(pg, { from: "2026-06-01", to: "2026-07-31" })!;
    expect(summer.rows.every((r) => r.receivedOn.slice(0, 10) >= "2026-06-01" && r.receivedOn.slice(0, 10) <= "2026-07-31")).toBe(true);

    const untagged = scopedContributions(pg, { collectionId: "none" })!;
    expect(untagged.rows.every((r) => !r.collectionId)).toBe(true);
  });

  it("collection totals are broken down by chapter and limited to the viewer's scope", () => {
    const pgTractor = collectionSummaries(actor("mem_pg")).find((c) => c.id === "col_tractor")!;
    expect(pgTractor.byChapter).toHaveLength(5); // every chapter (payments made to the centre count for the payer's chapter)
    expect(pgTractor.partial).toBe(false);
    expect(pgTractor.outstanding).toBe(pgTractor.byChapter.reduce((s, b) => s + b.outstanding, 0));
    // A chapter Financial Secretary sees the same collection, but only their own chapter's share.
    const fsTractor = collectionSummaries(actor("mem_finsec")).find((c) => c.id === "col_tractor")!;
    expect(fsTractor.byChapter.map((b) => b.chapterId)).toEqual(["ch_a1"]);
    expect(fsTractor.partial).toBe(true);
  });

  it("only those who manage collections can set them up, within their scope", () => {
    const input = { name: "Example generator fund", description: "Buying a generator", scope: "organization", executiveAmount: 5000, memberAmount: 2000, startsOn: "2026-10-01" };
    expect(commands.createCollection(actor("mem_pg"), input).ok).toBe(false); // not a finance officer
    expect(commands.createCollection(actor("mem_finsec"), input).ok).toBe(false); // chapter-level only
    expect(commands.createCollection(actor("mem_cfs"), input).ok).toBe(true);
    expect(commands.createCollection(actor("mem_finsec"), { ...input, name: "Example A1 fund", scope: "chapter:ch_a1" }).ok).toBe(true);
    // Projects belong to the body that sets them up: the centre does not create a chapter's projects.
    expect(commands.createCollection(actor("mem_cfs"), { ...input, name: "Example central-made A1 fund", scope: "chapter:ch_a1" }).ok).toBe(false);
  });

  it("Regional Coordinators set up projects for their own region — not for its chapters or other regions", () => {
    const input = { name: "Example regional dance", description: "Regional dance festival", scope: "region:reg_a", executiveAmount: 5000, memberAmount: 1500, startsOn: "2026-10-01" };
    const coord = actor("mem_coord");
    expect(commands.createCollection(coord, input).ok).toBe(true);
    expect(db().collections.at(-1)).toMatchObject({ scope: { level: "region", regionId: "reg_a" }, expected: { executive: 5000, member: 1500 } });
    expect(commands.createCollection(coord, { ...input, name: "Example B festival", scope: "region:reg_b" }).ok).toBe(false);
    expect(commands.createCollection(coord, { ...input, name: "Example A1 festival", scope: "chapter:ch_a1" }).ok).toBe(false);
  });

  it("a project needs a purpose and an amount for at least one group", () => {
    const fs = actor("mem_finsec");
    const input = { name: "Example A1 shelter", description: "Bus shelter", scope: "chapter:ch_a1", executiveAmount: 0, memberAmount: 0, startsOn: "2026-10-01" };
    expect(commands.createCollection(fs, input).ok).toBe(false);
    expect(commands.createCollection(fs, { ...input, description: "" , memberAmount: 1000 }).ok).toBe(false);
    expect(commands.createCollection(fs, { ...input, executiveAmount: 3000 }).ok).toBe(true);
  });

  it("a payment can only be tagged with a collection that applies to the member's chapter", () => {
    const fs = actor("mem_finsec");
    const base = { memberId: "mem_member", type: "contribution", amount: 1000, receivedOn: "2026-10-01" };
    expect(commands.recordContribution(fs, { ...base, collectionId: "col_b2_hall" }).ok).toBe(false); // B2's collection
    expect(commands.recordContribution(fs, { ...base, collectionId: "col_tractor" }).ok).toBe(true);
  });
});

describe("the central ledger", () => {
  const base = { ledger: "central", type: "contribution", collectionId: "col_tractor", receivedOn: "2026-10-01" };
  let n = 0;
  /** A fresh organisation-wide project nobody has paid yet. */
  const fresh = () => {
    commands.createCollection(actor("mem_cfs"), { name: `Example central project ${++n}`, description: "Example purpose", scope: "organization", executiveAmount: "25,000", memberAmount: "10,000", startsOn: "2026-01-01" });
    return db().collections.at(-1)!.id;
  };

  it("the National Financial Secretary records money members pay the centre directly — always the full amount due", () => {
    const cfs = actor("mem_cfs");
    const project = fresh();
    expect(commands.recordContribution(cfs, { ...base, collectionId: project, payer: "member:mem_vpg" }).ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ ledger: "central", memberId: "mem_vpg", type: "contribution", amount: 25000, expectedAmount: 25000 });
  });

  it("Contribution and Fine are the only payment types — no remittances, no chapter payers", () => {
    const cfs = actor("mem_cfs");
    expect(commands.recordContribution(cfs, { ...base, payer: "member:mem_vpg", type: "remittance" }).ok).toBe(false);
    expect(commands.recordContribution(cfs, { ...base, payer: "chapter:ch_a1", type: "contribution" }).ok).toBe(false);
    expect(db().contributions.every((c) => c.type === "contribution" || c.type === "fine")).toBe(true);
    expect(db().contributions.every((c) => !!c.memberId)).toBe(true);
  });

  it("amounts typed with thousand separators are understood", () => {
    const fs = actor("mem_finsec");
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", description: "Example: late", expectedAmount: "2,500", paidNow: "yes", receivedOn: "2026-10-01" }).ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ expectedAmount: 2500, amount: 2500 });
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", description: "Example: late again", expectedAmount: "1 500", paidNow: "yes", receivedOn: "2026-10-01" }).ok).toBe(true);
    expect(db().contributions.at(-1)!.amount).toBe(1500);
  });

  it("she cannot write to a chapter's ledger — chapters keep their own records", () => {
    const cfs = actor("mem_cfs");
    expect(commands.recordContribution(cfs, { memberId: "mem_member", type: "contribution", collectionId: "col_dues", amount: 1000, receivedOn: "2026-10-01" }).ok).toBe(false);
    expect(commands.voidContribution(cfs, { id: "ct_3", reason: "Not hers to void" }).ok).toBe(false);
  });

  it("she voids central records; chapter Financial Secretaries cannot touch the central ledger", () => {
    const central = db().contributions.find((c) => c.ledger === "central")!;
    expect(commands.voidContribution(actor("mem_finsec"), { id: central.id, reason: "Chapter cannot void central" }).ok).toBe(false);
    expect(commands.recordContribution(actor("mem_finsec"), { ...base, payer: "member:mem_member" }).ok).toBe(false);
    expect(commands.voidContribution(actor("mem_cfs"), { id: central.id, reason: "Entered twice" }).ok).toBe(true);
  });

  it("central records stay out of chapter views, but members always see their own", () => {
    expect(scopedContributions(actor("mem_finsec"))!.rows.some((r) => r.ledger === "central")).toBe(false);
    expect(scopedContributions(actor("mem_cpres"))!.rows.some((r) => r.ledger === "central")).toBe(false);
    expect(scopedContributions(actor("mem_ctreas"))!.rows.some((r) => r.ledger === "central")).toBe(true);
    const pgOwn = myContributions(actor("mem_pg")).rows;
    expect(pgOwn.some((r) => r.ledger === "central" && r.collectionId === "col_tractor")).toBe(true);
  });
});

describe("projects, fines and what is owed", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("a contribution is always the full amount due for the project (executives and members differ), once per project", () => {
    const fs = actor("mem_finsec");
    commands.createCollection(fs, { name: "Example A1 benches", description: "Benches for the hall", scope: "chapter:ch_a1", executiveAmount: 8000, memberAmount: 4000, startsOn: "2026-01-01" });
    const benches = db().collections.at(-1)!;
    // Typed descriptions and amounts are ignored: the project decides.
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "contribution", collectionId: benches.id, description: "Anything", amount: 1, receivedOn: today }).ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ description: benches.description, expectedAmount: 4000, amount: 4000 });
    expect(commands.recordContribution(fs, { memberId: "mem_cpres", type: "contribution", collectionId: benches.id, receivedOn: today }).ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ expectedAmount: 8000, amount: 8000 }); // the Chapter President is an executive
    // No second (partial or extra) payment towards the same project…
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "contribution", collectionId: benches.id, receivedOn: today }).ok).toBe(false);
    expect(myContributions(actor("mem_s03")).projects.find((x) => x.collectionId === benches.id)).toMatchObject({ expected: 4000, paid: 4000, balance: 0 });
    // …unless the payment was voided.
    const paid = db().contributions.find((c) => c.collectionId === benches.id && c.memberId === "mem_s03")!;
    expect(commands.voidContribution(fs, { id: paid.id, reason: "Entered against wrong member" }).ok).toBe(true);
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "contribution", collectionId: benches.id, receivedOn: today }).ok).toBe(true);
  });

  it("a contribution must name a project; a fine never can", () => {
    const fs = actor("mem_finsec");
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "contribution", amount: 1000, receivedOn: today }).ok).toBe(false);
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "fine", collectionId: "col_dues", description: "Late", expectedAmount: 500, amount: 500, receivedOn: today }).ok).toBe(false);
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "dues", collectionId: "col_dues", amount: 1000, receivedOn: today }).ok).toBe(false); // old types are gone
  });

  it("receipt numbers are generated, unique, and cannot be supplied by the form", () => {
    const fs = actor("mem_finsec");
    const before = new Set(db().contributions.map((c) => c.reference));
    commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", description: "Example: late", expectedAmount: 1000, paidNow: "yes", receivedOn: today, reference: "MY-OWN-REF" });
    const ref = db().contributions.at(-1)!.reference;
    expect(ref).toMatch(/^RC-\d{4}-\d{5}$/);
    expect(before.has(ref)).toBe(false);
    expect(new Set(db().contributions.map((c) => c.reference)).size).toBe(db().contributions.length);
  });

  it("a fine is paid in full when imposed, or imposed now and paid later in one full payment", () => {
    const fs = actor("mem_finsec");
    const fine = (paidNow?: string) => commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", description: "Example: absent without excuse", expectedAmount: 3000, paidNow, receivedOn: today });
    expect(fine().ok).toBe(false); // must say whether it was paid
    expect(fine("yes").ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ type: "fine", expectedAmount: 3000, amount: 3000 });

    expect(fine("no").ok).toBe(true);
    const owed = db().contributions.at(-1)!;
    expect(owed).toMatchObject({ type: "fine", expectedAmount: 3000, amount: 0 });
    expect(myContributions(actor("mem_s03")).fines.find((f) => f.id === owed.id)!.balance).toBe(3000);

    // Paid later: always the whole fine, whatever is typed.
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", fineId: owed.id, amount: 1000, receivedOn: today }).ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ settlesFineId: owed.id, description: owed.description, amount: 3000 });
    expect(myContributions(actor("mem_s03")).fines.some((f) => f.id === owed.id)).toBe(false);
    expect(commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", fineId: owed.id, receivedOn: today }).ok).toBe(false); // already paid

    // The fine itself cannot be voided while its payment stands.
    expect(commands.voidContribution(fs, { id: owed.id, reason: "Imposed in error" }).ok).toBe(false);
  });

  // Money is formatted with non-breaking spaces ("FCFA 1,500").
  const said = (r: { ok: boolean; message?: string }) => (r.ok ? r.message! : "").replace(/\s/g, " ");

  it("there are no partial payments: every payment is recorded as paid in full", () => {
    const fs = actor("mem_finsec");
    commands.createCollection(fs, { name: "Example A1 chairs", description: "Chairs for the hall", scope: "chapter:ch_a1", executiveAmount: 6000, memberAmount: 3000, startsOn: "2026-01-01" });
    const chairs = db().collections.at(-1)!.id;
    const r = commands.recordContribution(fs, { memberId: "mem_s03", type: "contribution", collectionId: chairs, amount: 1500, receivedOn: today });
    expect(said(r)).toContain("Receipt RC-");
    const row = myContributions(actor("mem_s03")).rows.find((x) => x.collectionId === chairs)!;
    expect(row).toMatchObject({ amount: 3000, owedAfter: 0 });
  });

  it("paying an imposed fine reports it as paid in full", () => {
    const fs = actor("mem_finsec");
    commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", description: "Example: late", expectedAmount: 2000, paidNow: "no", receivedOn: today });
    const fine = db().contributions.at(-1)!;
    const done = commands.recordContribution(fs, { memberId: "mem_s03", type: "fine", fineId: fine.id, receivedOn: today });
    expect(said(done)).toContain("FCFA 2,000");
    expect(said(done)).toContain("Receipt RC-");
  });

  it("members see what they still owe; officers see who owes in their own chapter only", () => {
    const mine = myContributions(actor("mem_member"));
    const dues = mine.projects.find((p) => p.collectionId === "col_dues")!;
    expect(dues).toMatchObject({ expected: 12000, paid: 12000, balance: 0 });
    expect(mine.fines.some((f) => f.description.includes("Late arrival"))).toBe(true);
    expect(mine.owed).toBe(mine.projects.reduce((s, p) => s + p.balance, 0) + mine.fines.reduce((s, f) => s + f.balance, 0));

    const fsDues = collectionSummaries(actor("mem_finsec")).find((c) => c.id === "col_dues")!;
    expect(fsDues.byChapter.every((b) => b.debtors !== null)).toBe(true);
    // A Regional Coordinator sees who owes, by name, in their own region's chapters only (read-only).
    const coordDues = collectionSummaries(actor("mem_coord_b")).find((c) => c.id === "col_dues")!;
    expect(coordDues.byChapter.map((b) => b.chapterId).sort()).toEqual(["ch_b1", "ch_b2"]);
    expect(coordDues.byChapter.every((b) => b.debtors !== null)).toBe(true);
    const coordRows = scopedContributions(actor("mem_coord_b"))!.rows;
    expect(coordRows.length).toBeGreaterThan(0);
    expect(coordRows.every((r) => r.ledger === "chapter" && ["ch_b1", "ch_b2"].includes(r.chapterId))).toBe(true);
    expect(can(actor("mem_coord_b"), "RECORD_CONTRIBUTION", { chapterId: "ch_b1" }, org())).toBe(false); // view only
    // …and their region's registration, read only (the President General runs the renewal).
    const reg = registrationOverview(actor("mem_coord_b"))!;
    expect(reg.national).toBe(false);
    expect(reg.byChapter.map((c) => c.id).sort()).toEqual(["ch_b1", "ch_b2"]);
    expect(registrationOverview(actor("mem_pg"))!.national).toBe(true);
    expect(registrationOverview(actor("mem_finsec"))).toBeNull(); // the FS has the chapter desk instead
  });
});

describe("expenses (money out)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const input = { scope: "chapter:ch_a1", description: "Example: refreshments", amount: 15000, spentOn: today };

  it("the keeper of the funds records spending — at exactly their own level", () => {
    expect(commands.recordExpense(actor("mem_finsec"), input).ok).toBe(true);
    expect(db().expenses.at(-1)!.reference).toMatch(/^PV-\d{4}-\d{5}$/);
    expect(commands.recordExpense(actor("mem_finsec_b"), input).ok).toBe(false); // another chapter
    expect(commands.recordExpense(actor("mem_cfs"), input).ok).toBe(false); // the centre does not spend a chapter's money
    expect(commands.recordExpense(actor("mem_coord"), input).ok).toBe(false); // nor does the region
    expect(commands.recordExpense(actor("mem_cpres"), input).ok).toBe(false); // the President views, the Financial Secretary records
    expect(commands.recordExpense(actor("mem_coord"), { ...input, scope: "region:reg_a" }).ok).toBe(true);
    expect(commands.recordExpense(actor("mem_cfs"), { ...input, scope: "organization" }).ok).toBe(true);
  });

  it("is visible up the hierarchy, not across or down", () => {
    const labels = (id: string) => scopedExpenses(actor(id)).groups.map((g) => g.key).sort();
    expect(labels("mem_pg")).toEqual(["central", "ch_a1", "ch_b2", "ch_d", "region:reg_a"]);
    expect(labels("mem_coord")).toEqual(["ch_a1", "region:reg_a"]); // their region and its chapters
    expect(labels("mem_cpres")).toEqual(["ch_a1"]); // own chapter only — not the region's
    expect(labels("mem_finsec_b")).toEqual([]);
    expect(labels("mem_member")).toEqual([]);
  });

  it("is voided with a reason by the keeper only, and the summary balance subtracts it", () => {
    const year = new Date().getFullYear().toString();
    const before = financialSummary(actor("mem_finsec"))!.find((c) => c.key === "ch_a1")!;
    commands.recordExpense(actor("mem_finsec"), input);
    const id = db().expenses.at(-1)!.id;
    const after = financialSummary(actor("mem_finsec"))!.find((c) => c.key === "ch_a1")!;
    if (today.startsWith(year)) expect(after.balance).toBe(before.balance - 15000);
    expect(commands.voidExpense(actor("mem_cfs"), { id, reason: "Not the centre's to void" }).ok).toBe(false);
    expect(commands.voidExpense(actor("mem_finsec"), { id, reason: "" }).ok).toBe(false);
    expect(commands.voidExpense(actor("mem_finsec"), { id, reason: "Entered twice" }).ok).toBe(true);
    expect(db().expenses.find((e) => e.id === id)!.status).toBe("voided");
  });
});

describe("clean start for testing with real people", () => {
  it("keeps only the President General and the four regions — no chapters", async () => {
    const { createCleanStart } = await import("@/lib/demo/fixtures");
    const clean = createCleanStart();
    expect(clean.members.map((m) => m.id)).toEqual(["mem_pg"]);
    expect(clean.chapters).toHaveLength(0);
    expect(clean.affiliations).toHaveLength(0);
    expect(clean.regions.map((r) => r.name)).toEqual(["South-West", "North-West", "Diaspora"]);
    expect(clean.accounts.map((a) => a.memberId)).toEqual(["mem_pg"]);
    for (const k of ["contributions", "collections", "expenses", "meetings", "documents", "notifications", "audit", "delegations"] as const) {
      expect(clean[k]).toHaveLength(0);
    }
    expect(clean.assignments.map((a) => a.roleKey)).toEqual(["PRESIDENT_GENERAL"]);
  });

  it("people created in the portal sign in with the temporary password set for them — not the shared one", async () => {
    const { verifyDemoCredentials, passwordStatus } = await import("@/lib/auth/demo-credentials");
    const { DEMO_PASSWORD } = await import("@/lib/demo/fixtures");
    const input = { fullName: "Example Real Person", email: "real.person@example.invalid", chapterId: "ch_a1", registrationAmount: "5,000" };
    expect(commands.createMember(actor("mem_finsec"), input).ok).toBe(false); // a temporary password is required
    expect(commands.createMember(actor("mem_finsec"), { ...input, password: "", registrationAmount: 5000 }).ok).toBe(false);
    expect(commands.createMember(actor("mem_finsec"), { ...input, password: "Temp-pass-123", registrationAmount: 5000 }).ok).toBe(true);
    const id = db().members.at(-1)!.id;
    expect(verifyDemoCredentials("Real.Person@example.invalid", "Temp-pass-123")).toBe(id);
    expect(verifyDemoCredentials("real.person@example.invalid", DEMO_PASSWORD)).toBeNull();
    expect(verifyDemoCredentials("real.person@example.invalid", "wrong password")).toBeNull();
    expect(passwordStatus(id)).toBe("temporary");
    // Passwords are never stored with member records, and never in plain text.
    expect(JSON.stringify(db().members)).not.toContain("Temp-pass-123");
    expect(JSON.stringify(db().credentials)).not.toContain("Temp-pass-123");
  });

  it("members change their own password on their profile", async () => {
    const { verifyDemoCredentials, passwordStatus } = await import("@/lib/auth/demo-credentials");
    const { DEMO_PASSWORD } = await import("@/lib/demo/fixtures");
    const me = actor("mem_member"); // a demo account on the shared password
    expect(passwordStatus("mem_member")).toBe("shared");
    expect(commands.changePassword(me, { current: "wrong", next: "My-own-pass-1", confirm: "My-own-pass-1" }).ok).toBe(false);
    expect(commands.changePassword(me, { current: DEMO_PASSWORD, next: "My-own-pass-1", confirm: "different" }).ok).toBe(false);
    expect(commands.changePassword(me, { current: DEMO_PASSWORD, next: "", confirm: "" }).ok).toBe(false);
    expect(commands.changePassword(me, { current: DEMO_PASSWORD, next: "My-own-pass-1", confirm: "My-own-pass-1" }).ok).toBe(true);
    expect(passwordStatus("mem_member")).toBe("own");
    expect(verifyDemoCredentials("member@demo.ncuda.invalid", "My-own-pass-1")).toBe("mem_member");
    expect(verifyDemoCredentials("member@demo.ncuda.invalid", DEMO_PASSWORD)).toBeNull(); // the shared one no longer works
    expect(db().audit.at(-1)).toMatchObject({ action: "UPDATE", entityType: "credential", actorId: "mem_member" });
    expect(JSON.stringify(db().audit.at(-1))).not.toContain("My-own-pass-1");
  });
});

describe("one person, one post", () => {
  it("someone holding a post cannot be given another until it is ended", () => {
    const cp = actor("mem_cpres"); // Chapter President of A1
    // mem_finsec is A1's Financial Secretary.
    const r = commands.assignRole(cp, { memberId: "mem_finsec", roleKey: "TREASURER" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("holds Financial Secretary");
    const post = currentPost("mem_finsec")!;
    expect(commands.endRole(cp, { assignmentId: post.assignment.id, reason: "Moving to Treasurer" }).ok).toBe(true);
    expect(currentPost("mem_finsec")).toBeNull();
    // mem_treas is A1's Treasurer already, so free the post by moving them out first.
    const treas = currentPost("mem_treas")!;
    expect(commands.endRole(cp, { assignmentId: treas.assignment.id, reason: "End of term" }).ok).toBe(true);
    expect(commands.assignRole(cp, { memberId: "mem_finsec", roleKey: "TREASURER" }).ok).toBe(true);
    expect(db().assignments.filter((a) => a.memberId === "mem_finsec" && a.status === "active").map((a) => a.roleKey)).toEqual(["TREASURER"]);
  });

  it("a post holder cannot be made coordinator of a region or President of a new chapter", () => {
    const pg = actor("mem_pg");
    expect(commands.createRegion(pg, { name: "Example Region P", coordinator: { mode: "existing", memberId: "mem_cpres" } }).ok).toBe(false);
    // A region's coordinator is chosen from its chapters: A1's President is listed for Region A, but disabled (holds a post).
    const regionA = listRegions(pg)!.regions.find((r) => r.id === "reg_a")!;
    expect(regionA.candidates.find((c) => c.id === "mem_cpres")?.disabled).toBe(true);
    expect(regionA.candidates.find((c) => c.id === "mem_member")?.disabled).toBe(false);
    expect(regionA.candidates.some((c) => c.id === "mem_d_m1")).toBe(false); // another region's member
    expect(listRegions(pg)!.candidates).toEqual([]); // a new region: a new person
    const input = { name: "Example P chapter", location: "Town", regionId: "reg_b", president: { mode: "existing", memberId: "mem_b2_fs" }, exco: {} };
    expect(commands.createChapter(actor("mem_coord_b"), input).ok).toBe(false); // B2's Financial Secretary
  });
});

describe("editing regions and chapters; moving members", () => {
  it("the President General renames regions; coordinators edit their own chapters", () => {
    expect(commands.updateRegion(actor("mem_pg"), { regionId: "reg_a", name: "Example Region A (renamed)" }).ok).toBe(true);
    expect(db().regions.find((r) => r.id === "reg_a")!.name).toBe("Example Region A (renamed)");
    expect(commands.updateRegion(actor("mem_coord"), { regionId: "reg_a", name: "Mine" }).ok).toBe(false);
    expect(commands.updateRegion(actor("mem_pg"), { regionId: "reg_a", name: "Sample Region B" }).ok).toBe(false); // name taken

    expect(commands.updateChapter(actor("mem_coord"), { chapterId: "ch_a1", name: "Example A1 renamed", location: "Bamenda" }).ok).toBe(true);
    expect(db().chapters.find((c) => c.id === "ch_a1")).toMatchObject({ name: "Example A1 renamed", location: "Bamenda" });
    expect(commands.updateChapter(actor("mem_coord"), { chapterId: "ch_b1", name: "Not mine", location: "X" }).ok).toBe(false); // Region B
    expect(commands.updateChapter(actor("mem_cpres"), { chapterId: "ch_a1", name: "By the president", location: "X" }).ok).toBe(false);
    expect(commands.updateChapter(actor("mem_pg"), { chapterId: "ch_b1", name: "Example B1 renamed", location: "Buea" }).ok).toBe(true);
    expect(db().audit.at(-1)).toMatchObject({ action: "UPDATE", entityType: "chapter", entityId: "ch_b1" });
  });

  it("members move to another chapter — within a region by its coordinator, across regions by the President General", () => {
    // mem_a1_m1: an ordinary member of A1 (Region A).
    expect(commands.transferMember(actor("mem_coord"), { memberId: "mem_a1_m1", toChapterId: "ch_a2" }).ok).toBe(true);
    expect(currentChapter("mem_a1_m1")).toBe("ch_a2");
    expect(commands.transferMember(actor("mem_coord"), { memberId: "mem_a1_m1", toChapterId: "ch_b1" }).ok).toBe(false); // out of Region A
    expect(commands.transferMember(actor("mem_cpres"), { memberId: "mem_a1_m2", toChapterId: "ch_a2" }).ok).toBe(false); // presidents don't move members
    expect(commands.transferMember(actor("mem_pg"), { memberId: "mem_a1_m1", toChapterId: "ch_b1", note: "Moved to Buea" }).ok).toBe(true);
    expect(currentChapter("mem_a1_m1")).toBe("ch_b1");
    expect(db().affiliations.filter((a) => a.memberId === "mem_a1_m1").map((a) => [a.chapterId, a.endedAt === null])).toEqual([
      ["ch_a1", false],
      ["ch_a2", false],
      ["ch_b1", true],
    ]);
    // One person, one post: a chapter officer gives up their post first.
    const r = commands.transferMember(actor("mem_pg"), { memberId: "mem_finsec", toChapterId: "ch_b1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Uplift that post first");
    // Nobody moves themselves between chapters.
    expect(commands.transferMember(actor("mem_coord"), { memberId: "mem_coord", toChapterId: "ch_a1" }).ok).toBe(false);
  });

  it("a member who owes a fine must pay it before being moved", () => {
    // mem_member has an unpaid 1,000 fine in A1 (fixtures).
    const pg = actor("mem_pg");
    const r = commands.transferMember(pg, { memberId: "mem_member", toChapterId: "ch_b1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.replace(/\s/g, " ")).toContain("FCFA 1,000 in fines");
    const fine = db().contributions.find((c) => c.memberId === "mem_member" && c.type === "fine" && !c.settlesFineId)!;
    expect(commands.recordContribution(actor("mem_finsec"), { memberId: "mem_member", type: "fine", fineId: fine.id, amount: 1000, receivedOn: new Date().toISOString().slice(0, 10) }).ok).toBe(true);
    expect(commands.transferMember(pg, { memberId: "mem_member", toChapterId: "ch_b1" }).ok).toBe(true);
  });

  it("someone not yet in a chapter can be placed in one — including by themselves", async () => {
    const { createCleanStart } = await import("@/lib/demo/fixtures");
    const g2 = globalThis as unknown as { __ncudaDemoDB?: unknown };
    g2.__ncudaDemoDB = createCleanStart();
    const pg = actor("mem_pg");
    expect(pg.chapterId).toBeNull();
    // A coordinator and a chapter in South-West, then the President General joins it.
    commands.createRegion(pg, { name: "Example region Z", coordinator: { mode: "new", fullName: "Zed Coordinator", email: "zed@example.invalid", password: "1" } });
    const coord = db().members.find((m) => m.email === "zed@example.invalid")!;
    const reg = db().regions.at(-1)!;
    expect(commands.createChapter(actor(coord.id), { name: "Example Z chapter", location: "Z town", regionId: reg.id, president: { mode: "new", fullName: "Zed President", email: "zp@example.invalid", password: "1" }, financialSecretary: { mode: "new", fullName: "Zed FinSec", email: "zfs@example.invalid", password: "1" }, exco: {} }).ok).toBe(true);
    const ch = db().chapters.at(-1)!;
    // A chapter now exists: the President General may no longer set up regions until he joins one.
    const waiting = actor("mem_pg");
    expect(waiting.mustJoinChapter).toBe(true);
    expect(commands.createRegion(waiting, { name: "Example region Y", coordinator: { mode: "new", fullName: "Yan Coordinator", email: "yan@example.invalid", password: "1" } }).ok).toBe(false);
    expect(commands.transferMember(waiting, { memberId: "mem_pg", toChapterId: ch.id }).ok).toBe(true);
    expect(actor("mem_pg").mustJoinChapter).toBe(false);
    expect(hasAnywhere(actor("mem_pg"), "CREATE_REGION")).toBe(true); // setup powers back while registration is unpaid
    expect(actor("mem_pg").chapterId).toBe(ch.id);
    // The coordinator places themselves too.
    expect(commands.transferMember(actor(coord.id), { memberId: coord.id, toChapterId: ch.id }).ok).toBe(true);
  });
});

/** A member's current chapter. */
function currentChapter(memberId: string) {
  return db().affiliations.find((a) => a.memberId === memberId && a.endedAt === null)?.chapterId ?? null;
}

describe("registration", () => {
  const today = new Date().toISOString().slice(0, 10);
  const start = () => commands.startRegistrationRenewal(actor("mem_pg"), { year: 2027, confirm: "on" });
  const registration = (by: string, memberId: string) => commands.recordContribution(actor(by), { memberId, type: "contribution", collectionId: "registration", receivedOn: today });
  /** Removes someone's registration payments (as if never paid). */
  const unpaid = (memberId: string) => {
    db().contributions = db().contributions.filter((c) => !(c.memberId === memberId && c.registrationFee));
  };

  it("nobody is active without paying their chapter's registration — the President General included", () => {
    expect(actor("mem_member").inactive).toBeNull(); // the demo members have paid
    unpaid("mem_member");
    unpaid("mem_pg");
    expect(actor("mem_member").inactive).toBeTruthy();
    expect(actor("mem_pg").inactive).toBeTruthy();
    expect(registrationStanding("mem_member")).toMatchObject({ fee: 5000, registered: false, chapterId: "ch_a1" });
  });

  it("the Financial Secretary sets the chapter's fee (one amount for everyone) and may change it for future payments", () => {
    expect(commands.setChapterRegistrationFee(actor("mem_cpres"), { chapterId: "ch_a1", amount: "6,000" }).ok).toBe(false); // not the President
    expect(commands.setChapterRegistrationFee(actor("mem_finsec_b"), { chapterId: "ch_a1", amount: "6,000" }).ok).toBe(false); // another chapter's FS
    const before = db().contributions.find((c) => c.memberId === "mem_member" && c.registrationFee)!.amount;
    expect(commands.setChapterRegistrationFee(actor("mem_finsec"), { chapterId: "ch_a1", amount: "6,000" }).ok).toBe(true);
    expect(db().chapters.find((c) => c.id === "ch_a1")!.registrationFee).toBe(6000);
    expect(db().contributions.find((c) => c.memberId === "mem_member" && c.registrationFee)!.amount).toBe(before); // payments keep their amount
    // Executives and members pay the same.
    unpaid("mem_member");
    unpaid("mem_cpres");
    expect(registration("mem_finsec", "mem_member").ok).toBe(true);
    expect(registration("mem_finsec", "mem_cpres").ok).toBe(true);
    expect(db().contributions.filter((c) => c.registrationFee && ["mem_member", "mem_cpres"].includes(c.memberId)).map((c) => c.amount)).toEqual([6000, 6000]);
  });

  it("the Financial Secretary sees everyone in their chapter who has not paid — themselves first — and records each in one step", () => {
    for (const id of ["mem_member", "mem_cpres", "mem_finsec"]) unpaid(id);
    const list = registrationToCollect(actor("mem_finsec"))!;
    expect(list.people.map((x) => x.id)).toEqual(["mem_finsec", ...list.people.slice(1).map((x) => x.id)]);
    expect(list.people.map((x) => x.id)).toEqual(expect.arrayContaining(["mem_member", "mem_cpres"]));
    expect(list.people.every((x) => x.chapterId === "ch_a1" && x.fee === 5000)).toBe(true);
    expect(list.people.find((x) => x.id === "mem_cpres")!.post).toBe("Chapter President");
    expect(registration("mem_finsec", "mem_cpres").ok).toBe(true);
    expect(registrationToCollect(actor("mem_finsec"))!.people.some((x) => x.id === "mem_cpres")).toBe(false);
    expect(registrationToCollect(actor("mem_member"))).toBeNull(); // not a Financial Secretary
  });

  it("Registration is its own type — recorded, filtered and summarised apart from contributions and fines", () => {
    unpaid("mem_member");
    const r = commands.recordContribution(actor("mem_finsec"), { memberId: "mem_member", type: "registration", receivedOn: today });
    expect(r.ok).toBe(true);
    const row = db().contributions.at(-1)!;
    expect(row).toMatchObject({ type: "contribution", registrationFee: { year: new Date().getFullYear() }, amount: 5000 });
    const mine = myContributions(actor("mem_member")).rows;
    expect(mine.find((x) => x.id === row.id)!.kind).toBe("registration");
    expect(mine.some((x) => x.kind === "contribution")).toBe(true); // the demo member also paid projects
    expect(scopedContributions(actor("mem_finsec"), { type: "registration" })!.rows.every((x) => x.kind === "registration")).toBe(true);
    // The payer gets the receipt in their notifications — and only they do.
    const receipt = listNotifications(actor("mem_member")).find((n) => n.title === `Receipt ${row.reference} · Registration ${new Date().getFullYear()}`);
    expect(receipt?.body).toContain(formatMoney(5000));
    expect(receipt?.link).toBe("/dashboard/finances?tab=mine");
    expect(listNotifications(actor("mem_cpres")).some((n) => n.title.includes(row.reference))).toBe(false);
    expect(scopedContributions(actor("mem_finsec"), { type: "contribution" })!.rows.some((x) => x.id === row.id)).toBe(false);
    const card = financialSummary(actor("mem_pg"))!.find((c) => c.key === "ch_a1")!;
    expect(Object.keys(card.byKind).sort()).toEqual(["contribution", "fine", "registration"]);
    expect(card.byKind.registration).toBeGreaterThanOrEqual(5000);
  });

  it("the Financial Secretary's registration desk: the chapter's fee, who still has to pay, and who has paid (with receipts)", () => {
    unpaid("mem_member");
    const desk = registrationDesk(actor("mem_finsec"))!;
    const a1 = desk.chapters.find((c) => c.chapterId === "ch_a1")!;
    expect(desk.chapters.map((c) => c.chapterId)).toEqual(["ch_a1"]); // only their own chapter
    expect(a1.fee).toBe(5000);
    expect(a1.unpaid.map((x) => x.id)).toContain("mem_member");
    expect(a1.paid.some((x) => x.id === "mem_member")).toBe(false);
    expect(registration("mem_finsec", "mem_member").ok).toBe(true);
    const after = registrationDesk(actor("mem_finsec"))!.chapters[0];
    expect(after.paid.find((x) => x.id === "mem_member")).toMatchObject({ amount: 5000 });
    expect(after.paid.find((x) => x.id === "mem_member")!.reference).toMatch(/^RC-/);
    expect(registrationDesk(actor("mem_cpres"))).toBeNull(); // the Chapter President does not register members
    expect(registrationDesk(actor("mem_pg"))).toBeNull(); // the President General follows it nationally instead
  });

  it("registration is recorded at the member's chapter, in full and once; the member is active at once", () => {
    unpaid("mem_member");
    expect(registration("mem_finsec_b", "mem_member").ok).toBe(false); // not their chapter
    expect(commands.recordContribution(actor("mem_cfs"), { ledger: "central", payer: "member:mem_member", type: "contribution", collectionId: "registration", receivedOn: today }).ok).toBe(false); // not centrally
    const r = registration("mem_finsec", "mem_member");
    expect(r.ok).toBe(true);
    expect(db().contributions.at(-1)).toMatchObject({ memberId: "mem_member", chapterId: "ch_a1", amount: 5000, registrationFee: { year: new Date().getFullYear() } });
    expect(actor("mem_member").inactive).toBeNull();
    expect(registration("mem_finsec", "mem_member").ok).toBe(false); // already paid
  });

  it("while unpaid, officers keep only their setup powers", () => {
    for (const id of ["mem_pg", "mem_coord", "mem_cpres", "mem_finsec"]) unpaid(id);
    const pg = actor("mem_pg");
    expect(can(pg, "CREATE_REGION", { organization: true }, org())).toBe(true);
    expect(can(pg, "MANAGE_REGISTRATION", { organization: true }, org())).toBe(true);
    expect(can(pg, "MANAGE_NOTIFICATIONS", { organization: true }, org())).toBe(false);
    expect(can(actor("mem_coord"), "CREATE_CHAPTER", { regionId: "reg_a" }, org())).toBe(true);
    expect(can(actor("mem_coord"), "VIEW_CONTRIBUTIONS", A1, org())).toBe(false);
    const fs = actor("mem_finsec");
    expect(can(fs, "CREATE_MEMBER", A1, org())).toBe(true);
    expect(commands.setChapterRegistrationFee(fs, { chapterId: "ch_a1", amount: 4000 }).ok).toBe(true);
    // The FS records only registration — their own included — and is then active.
    commands.createCollection(actor("mem_cfs"), { name: "Example unpaid project", description: "Example purpose", scope: "organization", executiveAmount: 1000, memberAmount: 1000, startsOn: "2026-01-01" });
    const other = db().collections.at(-1)!.id;
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "contribution", collectionId: other, receivedOn: today }).ok).toBe(false);
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "fine", description: "Late", expectedAmount: 500, paidNow: "yes", receivedOn: today }).ok).toBe(false);
    expect(registration("mem_finsec", "mem_finsec").ok).toBe(true);
    expect(actor("mem_finsec").inactive).toBeNull();
    expect(actor("mem_cpres").inactive).toBeTruthy();
    expect(can(actor("mem_cpres"), "ASSIGN_ROLE", A1, org())).toBe(false);
  });

  it("the President General and coordinators join a chapter to pay — coordinators only within their region", () => {
    const d = db();
    const leave = (id: string) => d.affiliations.filter((a) => a.memberId === id && a.endedAt === null).forEach((a) => (a.endedAt = new Date().toISOString()));
    for (const id of ["mem_pg", "mem_coord"]) {
      leave(id);
      unpaid(id);
    }
    const pgOptions = transferOptions(actor("mem_pg"), "mem_pg")!.destinations.map((c) => c.id);
    expect(pgOptions).toEqual(expect.arrayContaining(["ch_a1", "ch_b1"]));
    const coordOptions = transferOptions(actor("mem_coord"), "mem_coord")!.destinations.map((c) => c.id);
    expect(coordOptions).toContain("ch_a1");
    expect(coordOptions).not.toContain("ch_b1"); // another region
    expect(commands.transferMember(actor("mem_coord"), { memberId: "mem_coord", toChapterId: "ch_a1", reason: "" }).ok).toBe(true);
    expect(registration("mem_finsec", "mem_coord").ok).toBe(true);
    expect(actor("mem_coord").inactive).toBeNull();
  });

  it("only the President General starts a yearly renewal, once per year, after confirming; everyone pays again", () => {
    expect(commands.startRegistrationRenewal(actor("mem_cfs"), { year: 2027, confirm: "on" }).ok).toBe(false);
    expect(commands.startRegistrationRenewal(actor("mem_pg"), { year: 2027 }).ok).toBe(false); // not confirmed
    expect(start().ok).toBe(true);
    expect(start().ok).toBe(false); // already started
    for (const id of ["mem_member", "mem_cpres", "mem_finsec", "mem_pg", "mem_coord"]) expect(actor(id).inactive).toMatchObject({ year: 2027 });
    expect(registration("mem_finsec", "mem_member").ok).toBe(true);
    expect(db().contributions.at(-1)!.registrationFee).toEqual({ year: 2027 });
    expect(actor("mem_member").inactive).toBeNull();
    // New members registered now are paid for 2027 and active at once.
    expect(commands.createMember(actor("mem_finsec"), { fullName: "Example New Member", email: "new.member@example.invalid", chapterId: "ch_a1", password: "1" }).ok).toBe(true);
    expect(actor(db().members.at(-1)!.id).inactive).toBeNull();
    // Cancelling: the previous period applies again.
    expect(commands.cancelRegistrationRenewal(actor("mem_cfs"), { reason: "Not hers to cancel" }).ok).toBe(false);
    expect(commands.cancelRegistrationRenewal(actor("mem_pg"), { reason: "Started by mistake" }).ok).toBe(true);
    expect(actor("mem_cpres").inactive).toBeNull();
  });
});

describe("committees", () => {
  const today = new Date().toISOString().slice(0, 10);
  // Projects come first, set up under Finances → Collections by the officer for that scope.
  const officerFor: Record<string, string> = { organization: "mem_cfs", "region:reg_a": "mem_coord", "region:reg_b": "mem_coord_b", "chapter:ch_a1": "mem_finsec" };
  const projectFor = (scope: string, name = `Example project ${scope}`) => {
    const existing = db().collections.find((c) => c.name === name);
    if (existing) return existing.id;
    const r = commands.createCollection(actor(officerFor[scope]), { name, description: "Example: buy and run a tractor", scope, executiveAmount: "20,000", memberAmount: "10,000", startsOn: today });
    if (!r.ok) throw new Error(r.error);
    return db().collections.at(-1)!.id;
  };
  const create = (by: string, name: string, scope: string, collectionId = projectFor(scope in officerFor ? scope : "organization")) =>
    committees.createCommittee(actor(by), { name, scope, collectionId });
  const committeeNamed = (name: string) => db().committees!.find((c) => c.name === name)!;
  const add = (by: string, name: string, memberId: string, position = "") => committees.addCommitteeMember(actor(by), { committeeId: committeeNamed(name).id, memberId, position });

  it("the President General creates national committees, coordinators regional ones — each for a project set up beforehand", () => {
    const national = projectFor("organization");
    const before = db().collections.length;
    expect(create("mem_pg", "Example National", "organization").ok).toBe(true);
    expect(db().collections.length).toBe(before); // no new project
    expect(committeeNamed("Example National")).toMatchObject({ collectionId: national, purpose: "Example: buy and run a tractor" });
    expect(create("mem_coord", "Example Region A", "region:reg_a").ok).toBe(true);
    expect(committeeNamed("Example Region A").collectionId).toBe(projectFor("region:reg_a"));
    expect(create("mem_coord", "Example Region A phase 2", "region:reg_a").ok).toBe(true); // several committees per project
    expect(create("mem_coord", "Example wrong project", "region:reg_a", national).ok).toBe(false); // project of another scope
    expect(create("mem_pg", "Example no project", "organization", "").ok).toBe(false);
    const ended = projectFor("region:reg_a", "Example ended project");
    db().collections.find((c) => c.id === ended)!.endsOn = "2000-01-01T10:00:00Z";
    expect(create("mem_coord", "Example ended", "region:reg_a", ended).ok).toBe(false);
    const offered = committees.committeeProjectOptions(actor("mem_coord")).map((o) => o.value);
    expect(offered).toContain(projectFor("region:reg_a"));
    expect(offered).not.toContain(ended); // ended projects are not offered
    expect(offered).not.toContain(national); // nor projects of another scope
    expect(create("mem_coord", "Example national by coordinator", "organization").ok).toBe(false);
    expect(create("mem_coord", "Example other region", "region:reg_b").ok).toBe(false);
    expect(create("mem_cpres", "Example by president", "region:reg_a").ok).toBe(false);
    expect(create("mem_member", "Example by member", "organization").ok).toBe(false);
  });

  it("the creator adds members (from their region only for regional committees); creators are members only if they add themselves", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    expect(committees.getCommittee(actor("mem_coord"), committeeNamed("Example Region A").id)!.current).toHaveLength(0);
    expect(add("mem_coord", "Example Region A", "mem_member", "PRESIDENT").ok).toBe(true);
    expect(add("mem_coord", "Example Region A", "mem_s06").ok).toBe(false); // B1 is in Region B
    expect(add("mem_coord", "Example Region A", "mem_coord").ok).toBe(true); // explicitly adding themselves
    expect(add("mem_coord", "Example Region A", "mem_finsec", "PRESIDENT").ok).toBe(false); // position taken
    expect(add("mem_coord", "Example Region A", "mem_finsec", "TREASURER").ok).toBe(true); // a chapter post doesn't stop it
    expect(add("mem_pg", "Example Region A", "mem_s03").ok).toBe(false); // only the creator adds people
  });

  it("one active committee per person — freed when the committee is dissolved", () => {
    create("mem_pg", "Example National", "organization");
    create("mem_coord", "Example Region A", "region:reg_a");
    expect(add("mem_pg", "Example National", "mem_member").ok).toBe(true);
    expect(add("mem_coord", "Example Region A", "mem_member").ok).toBe(false);
    expect(committees.dissolveCommittee(actor("mem_pg"), { committeeId: committeeNamed("Example National").id, reason: "" }).ok).toBe(false); // reason required
    expect(committees.dissolveCommittee(actor("mem_coord"), { committeeId: committeeNamed("Example National").id, reason: "Not mine to dissolve" }).ok).toBe(false);
    expect(committees.dissolveCommittee(actor("mem_pg"), { committeeId: committeeNamed("Example National").id, reason: "Tractor bought and delivered" }).ok).toBe(true);
    expect(committeeNamed("Example National")).toMatchObject({ status: "dissolved", dissolveReason: "Tractor bought and delivered" });
    expect(add("mem_coord", "Example Region A", "mem_member").ok).toBe(true);
  });

  it("only members, the creator and the President General can see a committee", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    add("mem_coord", "Example Region A", "mem_member");
    const id = committeeNamed("Example Region A").id;
    expect(committees.getCommittee(actor("mem_coord"), id)).not.toBeNull();
    expect(committees.getCommittee(actor("mem_member"), id)).not.toBeNull();
    expect(committees.getCommittee(actor("mem_pg"), id)).not.toBeNull();
    expect(committees.getCommittee(actor("mem_cpres"), id)).toBeNull();
    expect(committees.getCommittee(actor("mem_coord_b"), id)).toBeNull();
    expect(committees.listCommittees(actor("mem_cpres"))).toHaveLength(0);
  });

  it("the committee President writes to the creator, with attachments; the creator writes to the committee", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    add("mem_coord", "Example Region A", "mem_member", "PRESIDENT");
    add("mem_coord", "Example Region A", "mem_s03");
    const id = committeeNamed("Example Region A").id;
    const file = { name: "report.pdf", type: "application/pdf", size: 5, bytes: new Uint8Array([37, 80, 68, 70, 45]) };
    expect(committees.sendCommitteeMessage(actor("mem_s03"), { committeeId: id, to: "creator", title: "Report", body: "Our progress report" }, [file]).ok).toBe(false); // not the President
    expect(committees.sendCommitteeMessage(actor("mem_member"), { committeeId: id, to: "creator", title: "Report", body: "Our progress report" }, [file]).ok).toBe(true);
    const inbox = listNotifications(actor("mem_coord"));
    const msg = inbox.find((n) => n.title.includes("Report"))!;
    expect(msg.attachments?.length).toBe(1);
    expect(listNotifications(actor("mem_s03")).some((n) => n.title.includes("Report"))).toBe(false);
    expect(committees.sendCommitteeMessage(actor("mem_coord"), { committeeId: id, to: "committee", title: "Thank you", body: "Well done, everyone" }).ok).toBe(true);
    expect(listNotifications(actor("mem_s03")).some((n) => n.title.includes("Thank you"))).toBe(true);
  });

  it("Chapter Presidents create chapter committees for the chapter's projects; the region's coordinator sees them", () => {
    const project = projectFor("chapter:ch_a1");
    expect(create("mem_finsec", "Example chapter committee", "chapter:ch_a1", project).ok).toBe(false); // not the Financial Secretary
    expect(create("mem_cpres", "Example wrong scope", "chapter:ch_a2", project).ok).toBe(false); // another chapter
    expect(create("mem_cpres", "Example chapter wrong project", "chapter:ch_a1", projectFor("organization")).ok).toBe(false);
    expect(create("mem_cpres", "Example chapter committee", "chapter:ch_a1", project).ok).toBe(true);
    expect(create("mem_a1_vp", "Example chapter committee 2", "chapter:ch_a1", project).ok).toBe(true); // the Vice President too
    const c = committeeNamed("Example chapter committee");
    expect(c.scope).toEqual({ level: "chapter", chapterId: "ch_a1" });
    // Members come from the chapter only.
    expect(add("mem_cpres", "Example chapter committee", "mem_member", "PRESIDENT").ok).toBe(true);
    expect(add("mem_cpres", "Example chapter committee", "mem_d_m1").ok).toBe(false);
    // Who sees it: creator, members, the President General, and the coordinator of the chapter's region (read only).
    const sees = (who: string) => committees.listCommittees(actor(who)).some((x) => x.id === c.id);
    expect(["mem_cpres", "mem_member", "mem_pg", "mem_coord"].every(sees)).toBe(true);
    expect(["mem_coord_b", "mem_sec"].some(sees)).toBe(false);
    expect(sees("mem_finsec")).toBe(true); // the chapter's Financial Secretary manages the chapter project's money
    const coordView = committees.getCommittee(actor("mem_coord"), c.id)!;
    expect(coordView.committee.scopeLabel).toBe("Sample Chapter A1 (chapter)");
    expect(coordView.seesBooks).toBe(true);
    expect(coordView.canManage).toBe(false);
    expect(add("mem_coord", "Example chapter committee", "mem_finsec").ok).toBe(false);
    // A chapter project's money stays in the chapter: nothing to send; the chapter's Financial Secretary gives the committee its money.
    expect(committees.sendableProjects("ch_a1").some((o) => o.value === project)).toBe(false);
    const give = (by: string, amount: number) => committees.recordDisbursement(actor(by), { committeeId: c.id, amount, paidOn: today });
    expect(give("mem_finsec", 1000).ok).toBe(false); // nothing collected yet
    expect(commands.recordContribution(actor("mem_finsec"), { memberId: "mem_member", type: "contribution", collectionId: project, receivedOn: today }).ok).toBe(true);
    expect(give("mem_cpres", 1000).ok).toBe(false); // the committee's creator does not
    expect(give("mem_finsec", 5000).ok).toBe(true);
    const given = db().expenses.at(-1)!;
    expect(given.scope).toEqual({ level: "chapter", chapterId: "ch_a1" }); // a chapter expense
    expect(scopedExpenses(actor("mem_finsec"))!.groups.flatMap((g) => g.rows).some((r) => r.id === given.id)).toBe(true);
    expect(committees.getCommittee(actor("mem_finsec"), c.id)!.money).toMatchObject({ chapterProject: true, received: 10000, toThis: 5000, held: 5000 });
  });

  it("project money goes to the project manager — whoever created the project — with or without a committee", () => {
    const national = projectFor("organization"); // created by the National Financial Secretary
    expect(committees.sendableProjects("ch_a1").find((o) => o.value === national)).toMatchObject({ recipientId: "mem_cfs" }); // no committee needed
    const pay = commands.recordContribution(actor("mem_finsec"), { memberId: "mem_member", type: "contribution", collectionId: national, receivedOn: today });
    expect(pay.ok).toBe(true);
    expect(committees.sendProjectMoney(actor("mem_finsec"), { kind: "send", scope: "chapter:ch_a1", sendFor: national, amount: 5000, spentOn: today }).ok).toBe(true);
    expect(listNotifications(actor("mem_cfs")).some((n) => n.title.endsWith("· Project money"))).toBe(true);
    // The President General creates its committee; the National Financial Secretary, as project manager, gives it money.
    expect(create("mem_pg", "Example national committee", "organization", national).ok).toBe(true);
    const c = committeeNamed("Example national committee");
    const view = committees.getCommittee(actor("mem_pg"), c.id)!;
    expect(view.managerName).toBe(db().members.find((m) => m.id === "mem_cfs")!.fullName);
    expect(view.canDisburse).toBe(false);
    expect(committees.recordDisbursement(actor("mem_pg"), { committeeId: c.id, amount: 1000, paidOn: today }).ok).toBe(false);
    expect(committees.getCommittee(actor("mem_cfs"), c.id)!.canDisburse).toBe(true); // the project manager sees the committee and gives it money
    expect(committees.recordDisbursement(actor("mem_cfs"), { committeeId: c.id, amount: 1000, paidOn: today }).ok).toBe(true);
    expect(committees.recordDisbursement(actor("mem_cfs"), { committeeId: c.id, amount: 4001, paidOn: today }).ok).toBe(false); // more than received
    // A new National Financial Secretary takes over national project money — whoever created the project.
    const old = db().assignments.find((a) => a.memberId === "mem_cfs" && a.roleKey === "CENTRAL_FINANCIAL_SECRETARY" && a.status === "active")!;
    old.status = "ended";
    db().assignments.push({ ...old, id: "ra_new_cfs", memberId: "mem_d_m1", status: "active", assignedAt: new Date().toISOString() });
    expect(committees.sendableProjects("ch_a1").find((o) => o.value === national)).toMatchObject({ recipientId: "mem_d_m1" });
    expect(committees.getCommittee(actor("mem_d_m1"), c.id)!.canDisburse).toBe(true);
    expect(committees.recordDisbursement(actor("mem_cfs"), { committeeId: c.id, amount: 1000, paidOn: today }).ok).toBe(false); // no longer in office
    expect(committees.recordDisbursement(actor("mem_d_m1"), { committeeId: c.id, amount: 4000, paidOn: today }).ok).toBe(true); // what is left of what chapters sent
  });

  it("project money: chapters send it to the committee's creator (a chapter expense); the creator gives it to the committee", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    add("mem_coord", "Example Region A", "mem_s03", "FINANCIAL_SECRETARY");
    const c = committeeNamed("Example Region A");
    const send = (by: string, amount: string | number, sendFor = c.collectionId) =>
      committees.sendProjectMoney(actor(by), { kind: "send", scope: "chapter:ch_a1", sendFor, amount, spentOn: today });
    expect(committees.sendableProjects("ch_a1").find((o) => o.value === c.collectionId)).toMatchObject({ recipientId: "mem_coord" });
    expect(send("mem_s03", 5000).ok).toBe(false); // the committee's FS is not the chapter's
    expect(send("mem_finsec", 1000).ok).toBe(false); // nothing collected yet
    const pay = (memberId: string, amount: number) =>
      commands.recordContribution(actor("mem_finsec"), { memberId, type: "contribution", collectionId: c.collectionId, amount, receivedOn: today });
    expect(pay("mem_member", 20000).ok).toBe(true);
    expect(pay("mem_cpres", 10000).ok).toBe(true);
    expect(send("mem_finsec", "30,001").ok).toBe(false); // more than collected
    expect(send("mem_finsec", "30,000").ok).toBe(true);
    const sent = db().expenses.at(-1)!;
    expect(sent).toMatchObject({ scope: { level: "chapter", chapterId: "ch_a1" }, sentFor: { collectionId: c.collectionId, toMemberId: "mem_coord" }, amount: 30000 });
    expect(scopedExpenses(actor("mem_finsec"))!.groups.flatMap((g) => g.rows).some((r) => r.id === sent.id)).toBe(true); // a chapter expense
    // The project manager gets the receipt in their notifications.
    const managerReceipt = listNotifications(actor("mem_coord")).find((n) => n.title === `Receipt ${sent.reference} · Project money`);
    expect(managerReceipt?.body).toContain(formatMoney(30000));
    expect(managerReceipt?.body).toContain("Sample Chapter A1");
    expect(managerReceipt?.body).not.toContain("You hold it");
    expect(managerReceipt?.link).toBe(`/dashboard/committees/${c.id}`);
    expect(listNotifications(actor("mem_finsec")).some((n) => n.title.includes(sent.reference))).toBe(false);
    expect(send("mem_finsec", 1).ok).toBe(false); // everything collected has been sent
    expect(send("mem_finsec", 1000, projectFor("organization")).ok).toBe(false); // that project has no committee

    const give = (by: string, amount: number) => committees.recordDisbursement(actor(by), { committeeId: c.id, amount, paidOn: today });
    expect(give("mem_s03", 1000).ok).toBe(false); // only the creator
    expect(give("mem_coord", 40000).ok).toBe(false); // more than they hold
    expect(give("mem_coord", 20000).ok).toBe(true);
    // The committee's Financial Secretary gets the receipt (not in the committee's messages).
    const given = db().expenses.at(-1)!;
    const committeeReceipt = listNotifications(actor("mem_s03")).find((n) => n.title === `Receipt ${given.reference} · Example Region A`);
    expect(committeeReceipt?.body).toContain(formatMoney(20000));
    expect(committeeReceipt?.body).toContain("Financial Secretary");
    expect(committees.getCommittee(actor("mem_s03"), c.id)!.messages.some((m) => m.title.includes(given.reference))).toBe(false);
    const view = committees.getCommittee(actor("mem_s03"), c.id)!;
    expect(view.money).toMatchObject({ received: 30000, toThis: 20000, held: 10000 });
    expect(view.canDisburse).toBe(false);
    expect(committees.getCommittee(actor("mem_coord"), c.id)!.canDisburse).toBe(true);
    expect(committees.voidCommitteeRecord(actor("mem_coord"), { id: db().expenses.at(-1)!.id, reason: "Entered twice" }).ok).toBe(true);
    expect(listNotifications(actor("mem_s03")).find((n) => n.title === `Cancelled: receipt ${given.reference}`)?.body).toContain("Reason: Entered twice");
    // A chapter voiding money it sent tells the project manager why.
    const extra = { ...sent, id: "ex_test_void", reference: "PV-TEST-1", status: "recorded" as const };
    db().expenses.push(extra);
    expect(commands.voidExpense(actor("mem_finsec"), { id: extra.id, reason: "Sent to the wrong person" }).ok).toBe(true);
    expect(listNotifications(actor("mem_coord")).find((n) => n.title === "Cancelled: receipt PV-TEST-1")?.body).toContain("Reason: Sent to the wrong person");
    expect(committees.getCommittee(actor("mem_coord"), c.id)!.money!.held).toBe(30000);
    committees.dissolveCommittee(actor("mem_coord"), { committeeId: c.id, reason: "Purpose served" });
    expect(give("mem_coord", 1000).ok).toBe(false); // dissolved
  });

  it("committee meetings: the President or Secretary schedules; officers record attendance; the Secretary publishes minutes", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    add("mem_coord", "Example Region A", "mem_member", "PRESIDENT");
    add("mem_coord", "Example Region A", "mem_s03", "SECRETARY");
    add("mem_coord", "Example Region A", "mem_finsec");
    const c = committeeNamed("Example Region A");
    const meeting = { committeeId: c.id, title: "Example planning meeting", startsAt: "2030-01-10T17:00", location: "Example hall", agenda: "Budget\nSellers" };
    expect(committees.scheduleCommitteeMeeting(actor("mem_finsec"), meeting).ok).toBe(false); // ordinary member
    expect(committees.scheduleCommitteeMeeting(actor("mem_coord"), meeting).ok).toBe(false); // creator, not a member
    expect(committees.scheduleCommitteeMeeting(actor("mem_member"), meeting).ok).toBe(true);
    const m = db().committeeMeetings!.at(-1)!;
    expect(m).toMatchObject({ agenda: ["Budget", "Sellers"], status: "scheduled", startsAt: "2030-01-10T16:00:00.000Z" });
    expect(listNotifications(actor("mem_s03")).some((n) => n.title.includes("Example planning meeting"))).toBe(true);

    expect(committees.recordCommitteeAttendance(actor("mem_finsec"), m.id, { mem_member: "present" }).ok).toBe(false);
    expect(committees.recordCommitteeAttendance(actor("mem_s03"), m.id, { mem_member: "present", mem_finsec: "late", mem_s06: "present" }).ok).toBe(true);
    expect(m.attendance.map((a) => a.memberId).sort()).toEqual(["mem_finsec", "mem_member"]); // non-members ignored

    expect(committees.setCommitteeMeetingStatus(actor("mem_member"), { meetingId: m.id, status: "held" }).ok).toBe(true);
    const minutes = { meetingId: m.id, text: "Example: we reviewed three sellers.", decisions: "Buy from seller B" };
    expect(committees.saveCommitteeMinutes(actor("mem_member"), minutes).ok).toBe(false); // the President doesn't write minutes
    expect(committees.saveCommitteeMinutes(actor("mem_s03"), minutes).ok).toBe(true);
    expect(committees.getCommitteeMeeting(actor("mem_member"), c.id, m.id)!.minutes?.status).toBe("draft"); // President sees the draft
    expect(committees.getCommitteeMeeting(actor("mem_finsec"), c.id, m.id)!.minutes).toBeNull(); // others don't
    expect(committees.saveCommitteeMinutes(actor("mem_s03"), { ...minutes, publish: "on" }).ok).toBe(true);
    expect(committees.getCommitteeMeeting(actor("mem_finsec"), c.id, m.id)!.minutes).toMatchObject({ status: "published", decisions: ["Buy from seller B"] });
    expect(committees.getCommitteeMeeting(actor("mem_pg"), c.id, m.id)).not.toBeNull();
    expect(committees.saveCommitteeMinutes(actor("mem_s03"), minutes).ok).toBe(false); // published minutes are final
    expect(committees.getCommitteeMeeting(actor("mem_cpres"), c.id, m.id)).toBeNull(); // outsiders
  });

  it("committee documents stay with the committee; message attachments stay with their message", () => {
    create("mem_coord", "Example Region A", "region:reg_a");
    add("mem_coord", "Example Region A", "mem_member", "PRESIDENT");
    add("mem_coord", "Example Region A", "mem_s03");
    const c = committeeNamed("Example Region A");
    const file = { name: "plan.pdf", type: "application/pdf", size: 5, bytes: new Uint8Array([37, 80, 68, 70, 45]) };
    expect(committees.uploadCommitteeDocument(actor("mem_s03"), { committeeId: c.id, title: "Example plan" }, file).ok).toBe(false); // ordinary member
    expect(committees.uploadCommitteeDocument(actor("mem_member"), { committeeId: c.id, title: "Example plan" }, file).ok).toBe(true);
    const doc = db().documents.at(-1)!;
    expect(doc.committeeId).toBe(c.id);
    expect(committees.getCommittee(actor("mem_s03"), c.id)!.documents.map((d) => d.id)).toEqual([doc.id]);
    expect(committees.committeeDocumentForDownload(actor("mem_s03"), doc.id)).not.toBeNull();
    expect(committees.committeeDocumentForDownload(actor("mem_coord"), doc.id)).not.toBeNull();
    expect(committees.committeeDocumentForDownload(actor("mem_cpres"), doc.id)).toBeNull();
    expect(listDocuments(actor("mem_finsec")).some((d) => d.id === doc.id)).toBe(false); // not in the general library

    committees.sendCommitteeMessage(actor("mem_member"), { committeeId: c.id, to: "creator", title: "Example report", body: "Our progress report" }, [{ ...file, name: "report.pdf" }]);
    const view = committees.getCommittee(actor("mem_coord"), c.id)!;
    expect(view.documents).toHaveLength(1); // the attachment is not a committee document…
    expect(view.messages[0]).toMatchObject({ title: "Example report", attachments: [{ filename: "report.pdf" }] }); // …it stays with the message
    expect(committees.getCommittee(actor("mem_s03"), c.id)!.messages).toHaveLength(0); // sent only to the creator
  });
});

describe("own profile", () => {
  it("anyone edits their own name, email and phone; the ID and membership number stay", async () => {
    const { verifyDemoCredentials } = await import("@/lib/auth/demo-credentials");
    const { DEMO_PASSWORD } = await import("@/lib/demo/fixtures");
    const before = structuredClone(db().members.find((m) => m.id === "mem_member")!);
    const me = actor("mem_member");
    expect(commands.updateProfile(me, { fullName: "Demo Member Renamed", email: before.email, phone: "+237 600 000 000" }).ok).toBe(true);
    let after = db().members.find((m) => m.id === "mem_member")!;
    expect(after).toMatchObject({ id: before.id, memberNumber: before.memberNumber, fullName: "Demo Member Renamed", phone: "+237 600 000 000" });
    // Changing the sign-in email needs the current password, and a free address.
    expect(commands.updateProfile(me, { fullName: "Demo Member Renamed", email: "new.me@example.invalid" }).ok).toBe(false);
    expect(commands.updateProfile(me, { fullName: "Demo Member Renamed", email: "finsec@demo.ncuda.invalid", currentPassword: DEMO_PASSWORD }).ok).toBe(false);
    expect(commands.updateProfile(me, { fullName: "Demo Member Renamed", email: "new.me@example.invalid", currentPassword: DEMO_PASSWORD }).ok).toBe(true);
    after = db().members.find((m) => m.id === "mem_member")!;
    expect(after.email).toBe("new.me@example.invalid");
    expect(verifyDemoCredentials("new.me@example.invalid", DEMO_PASSWORD)).toBe("mem_member");
    expect(verifyDemoCredentials("member@demo.ncuda.invalid", DEMO_PASSWORD)).toBeNull(); // the old address no longer signs in
    // Fields that are not editable are ignored.
    commands.updateProfile(me, { fullName: "X Y", email: "new.me@example.invalid", id: "hacked", memberNumber: "HACKED" } as never);
    expect(db().members.find((m) => m.id === "mem_member")!.memberNumber).toBe(before.memberNumber);
    expect(db().audit.at(-1)).toMatchObject({ action: "UPDATE", entityType: "member", entityId: "mem_member" });
  });

  it("while testing, any non-empty password is accepted (e.g. 0000)", async () => {
    const { verifyDemoCredentials } = await import("@/lib/auth/demo-credentials");
    const { DEMO_PASSWORD } = await import("@/lib/demo/fixtures");
    expect(commands.changePassword(actor("mem_pg"), { current: DEMO_PASSWORD, next: "0000", confirm: "0000" }).ok).toBe(true);
    expect(verifyDemoCredentials("president.general@demo.ncuda.invalid", "0000")).toBe("mem_pg");
  });
});

describe("financial accountability", () => {
  it("refuses a void from another chapter's Financial Secretary and changes nothing", () => {
    const before = structuredClone(db().contributions.find((c) => c.id === "ct_3"));
    const r = commands.voidContribution(actor("mem_finsec_b"), { id: "ct_3", reason: "Trying to tamper" });
    expect(r.ok).toBe(false);
    expect(db().contributions.find((c) => c.id === "ct_3")).toEqual(before);
  });

  it("requires a reason, keeps the record, and audits old and new values", () => {
    const fs = actor("mem_finsec");
    expect(commands.voidContribution(fs, { id: "ct_3", reason: "" }).ok).toBe(false);
    const r = commands.voidContribution(fs, { id: "ct_3", reason: "Entered against wrong member" });
    expect(r.ok).toBe(true);
    const row = db().contributions.find((c) => c.id === "ct_3")!;
    expect(row.status).toBe("voided");
    const entry = db().audit.at(-1)!;
    expect(entry).toMatchObject({ action: "VOID", entityId: "ct_3", actorId: "mem_finsec", actorRoles: ["FINANCIAL_SECRETARY"], oldValues: { status: "recorded" }, newValues: { status: "voided" } });
  });

  it("refuses recording by someone without RECORD_CONTRIBUTION", () => {
    const r = commands.recordContribution(actor("mem_cpres"), { memberId: "mem_member", type: "contribution", collectionId: "col_dues", amount: 1000, receivedOn: "2026-10-01" });
    expect(r.ok).toBe(false);
  });
});

describe("role assignment", () => {
  /** Ends a member's current post (as the sample data's President General would). */
  const uplift = (memberId: string) => {
    const a = db().assignments.find((x) => x.memberId === memberId && x.status === "active")!;
    a.status = "ended";
    a.endedAt = new Date().toISOString();
    a.endedBy = "mem_pg";
  };

  it("one post, one holder: a taken post cannot be given to someone else until its holder is uplifted", () => {
    const r = commands.assignRole(actor("mem_cpres"), { memberId: "mem_s01", roleKey: "FINANCIAL_SECRETARY" });
    expect(!r.ok && r.error).toContain("holds this post. Uplift them first.");
  });

  it("a regional role names its region, and a region with a coordinator cannot get another", () => {
    const pg = actor("mem_pg");
    expect(commands.assignRole(pg, { memberId: "mem_member", roleKey: "REGIONAL_COORDINATOR" }).ok).toBe(false); // no region chosen
    expect(commands.assignRole(pg, { memberId: "mem_member", roleKey: "REGIONAL_COORDINATOR", regionId: "reg_a" }).ok).toBe(false); // reg_a has one
    expect(commands.assignRole(pg, { memberId: "mem_member", roleKey: "REGIONAL_COORDINATOR", regionId: "reg_b" }).ok).toBe(false); // not their region
    uplift("mem_coord");
    expect(commands.assignRole(pg, { memberId: "mem_member", roleKey: "REGIONAL_COORDINATOR", regionId: "reg_a" }).ok).toBe(true); // a member of A1, in Region A
    expect(db().assignments.at(-1)).toMatchObject({ memberId: "mem_member", roleKey: "REGIONAL_COORDINATOR", scope: { level: "region", regionId: "reg_a" } });
  });

  it("nobody can assign roles to themselves", () => {
    const d = canAssignRole(actor("mem_cpres"), { targetMemberId: "mem_cpres", targetChapterId: "ch_a1", roleKey: "TREASURER", scope: { level: "chapter", chapterId: "ch_a1" } }, org());
    expect(d.ok).toBe(false);
  });

  it("a Chapter President appoints officers in their own chapter only", () => {
    expect(commands.assignRole(actor("mem_cpres"), { memberId: "mem_s01", roleKey: "TREASURER" }).ok).toBe(false); // A1 has a Treasurer
    uplift("mem_treas");
    expect(commands.assignRole(actor("mem_cpres"), { memberId: "mem_s01", roleKey: "TREASURER" }).ok).toBe(true);
    expect(commands.assignRole(actor("mem_cpres"), { memberId: "mem_s07", roleKey: "TREASURER" }).ok).toBe(false); // B1
  });

  it("a Chapter President cannot appoint another Chapter President", () => {
    expect(commands.assignRole(actor("mem_cpres"), { memberId: "mem_s01", roleKey: "CHAPTER_PRESIDENT" }).ok).toBe(false);
  });

  it("Regional Coordinators no longer appoint chapter officers", () => {
    expect(commands.assignRole(actor("mem_coord"), { memberId: "mem_s01", roleKey: "TREASURER" }).ok).toBe(false);
  });

  it("the President General appoints coordinators and chapter presidents, but not other chapter officers", () => {
    const pg = actor("mem_pg");
    expect(commands.assignRole(pg, { memberId: "mem_s01", roleKey: "TREASURER" }).ok).toBe(false);
    expect(commands.assignRole(pg, { memberId: "mem_s07", roleKey: "CHAPTER_PRESIDENT" }).ok).toBe(false); // B1 has a President
    const b1President = db().assignments.find((a) => a.roleKey === "CHAPTER_PRESIDENT" && a.status === "active" && a.scope.level === "chapter" && a.scope.chapterId === "ch_b1")!;
    uplift(b1President.memberId);
    expect(commands.assignRole(pg, { memberId: "mem_s07", roleKey: "CHAPTER_PRESIDENT" }).ok).toBe(true);
  });

  it("the President General cannot create another President General", () => {
    expect(commands.assignRole(actor("mem_pg"), { memberId: "mem_s08", roleKey: "PRESIDENT_GENERAL" }).ok).toBe(false);
  });

  it("role changes take effect immediately and history is preserved", () => {
    const cp = actor("mem_cpres");
    expect(can(actor("mem_s01"), "RECORD_CONTRIBUTION", A1, org())).toBe(false);

    uplift("mem_finsec"); // one Financial Secretary per chapter
    expect(commands.assignRole(cp, { memberId: "mem_s01", roleKey: "FINANCIAL_SECRETARY" }).ok).toBe(true);
    expect(can(actor("mem_s01"), "RECORD_CONTRIBUTION", A1, org())).toBe(true);

    const assignment = db().assignments.find((a) => a.memberId === "mem_s01" && a.status === "active")!;
    expect(commands.endRole(cp, { assignmentId: assignment.id, reason: "Handover" }).ok).toBe(true);
    expect(can(actor("mem_s01"), "RECORD_CONTRIBUTION", A1, org())).toBe(false);

    const history = db().assignments.filter((a) => a.memberId === "mem_s01");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "ended", endedBy: "mem_cpres", endReason: "Handover" });
    expect(db().audit.slice(-2).map((e) => e.action)).toEqual(["ASSIGN_ROLE", "REMOVE_ROLE"]);
  });
});

describe("prompt 3", () => {
  it("Vice Presidents hold all of their President's powers, appointing included", () => {
    const pg = actor("mem_pg");
    const vpg = actor("mem_vpg");
    for (const perm of ["CREATE_REGION", "CREATE_COMMITTEE", "MANAGE_REGISTRATION", "ASSIGN_ROLE"] as const) {
      expect(can(vpg, perm, { organization: true }, org())).toBe(can(pg, perm, { organization: true }, org()));
    }
    expect(canAssignRole(vpg, { targetMemberId: "mem_s05", targetChapterId: "ch_a1", roleKey: "CENTRAL_TREASURER", scope: { level: "organization" } }, org()).ok).toBe(
      canAssignRole(pg, { targetMemberId: "mem_s05", targetChapterId: "ch_a1", roleKey: "CENTRAL_TREASURER", scope: { level: "organization" } }, org()).ok,
    );
    const vp = actor("mem_a1_vp");
    expect(can(vp, "ASSIGN_ROLE", A1, org())).toBe(true);
    expect(can(vp, "VIEW_CONTRIBUTIONS", A1, org())).toBe(true);
    expect(canAssignRole(vp, { targetMemberId: "mem_s05", targetChapterId: "ch_a1", roleKey: "SOCIALS", scope: { level: "chapter", chapterId: "ch_a1" } }, org()).ok).toBe(true);
    expect(canAssignRole(vp, { targetMemberId: "mem_s05", targetChapterId: "ch_a1", roleKey: "CHAPTER_PRESIDENT", scope: { level: "chapter", chapterId: "ch_a1" } }, org()).ok).toBe(false); // not to the President's post
  });

  it("a committee's Vice President holds its President's powers", () => {
    commands.createCollection(actor("mem_coord"), { name: "Example VP project", description: "Example purpose", scope: "region:reg_a", executiveAmount: 1000, memberAmount: 1000, startsOn: "2026-01-01" });
    committees.createCommittee(actor("mem_coord"), { name: "Example VP committee", scope: "region:reg_a", collectionId: db().collections.at(-1)!.id });
    const c = db().committees!.at(-1)!;
    committees.addCommitteeMember(actor("mem_coord"), { committeeId: c.id, memberId: "mem_member", position: "VICE_PRESIDENT" });
    const vp = actor("mem_member");
    expect(committees.getCommittee(vp, c.id)!.canMessageCreator).toBe(true);
    expect(committees.sendCommitteeMessage(vp, { committeeId: c.id, to: "creator", title: "Example report", body: "Our progress" }).ok).toBe(true);
    expect(committees.scheduleCommitteeMeeting(vp, { committeeId: c.id, title: "Example meeting", startsAt: "2030-01-10T17:00", location: "Hall" }).ok).toBe(true);
    expect(committees.getCommittee(vp, c.id)!.seesBooks).toBe(true);
  });

  it("members are listed: chapter executives by rank, then coordinators, then national executives, then members A–Z", () => {
    const rows = listMembers(actor("mem_cpres"))!.rows.filter((r) => r.chapterId === "ch_a1");
    const groups = rows.map((r) => memberStanding(r.roles)[0]);
    expect([...groups].sort((x, y) => x - y)).toEqual(groups); // groups in order
    const exec = rows.filter((r) => memberStanding(r.roles)[0] === 0).map((r) => r.roles[0]);
    expect(exec[0]).toBe("CHAPTER_PRESIDENT");
    expect(exec.indexOf("FINANCIAL_SECRETARY")).toBeLessThan(exec.indexOf("TREASURER"));
    const ordinary = rows.filter((r) => r.roles.length === 0).map((r) => r.fullName);
    expect(ordinary).toEqual([...ordinary].sort((x, y) => x.localeCompare(y)));
    // A national executive who is a member of the chapter comes after its executives and before its ordinary members.
    const cfs = rows.findIndex((r) => r.id === "mem_cfs");
    expect(cfs).toBeGreaterThan(rows.findIndex((r) => r.roles.includes("TREASURER")));
    expect(cfs).toBeLessThan(rows.findIndex((r) => r.roles.length === 0));
  });

  it("national executives see the national level first, then coordinators, then chapter executives, then members", () => {
    const rows = listMembers(actor("mem_pg"))!.rows;
    const kind = (r: { roles: string[] }) =>
      r.roles.some((k) => ["PRESIDENT_GENERAL", "VICE_PRESIDENT_GENERAL", "SECRETARY_GENERAL", "CENTRAL_FINANCIAL_SECRETARY", "CENTRAL_TREASURER"].includes(k))
        ? 0
        : r.roles.includes("REGIONAL_COORDINATOR")
          ? 1
          : r.roles.length
            ? 2
            : 3;
    const kinds = rows.map(kind);
    expect(kinds).toEqual([...kinds].sort((x, y) => x - y));
    expect(rows[0].roles).toContain("PRESIDENT_GENERAL");
    expect(rows[1].roles).toContain("VICE_PRESIDENT_GENERAL");
  });

  it("a project shows the post that set it up", () => {
    expect(commands.createCollection(actor("mem_finsec"), { name: "Example post project", description: "Example purpose", scope: "chapter:ch_a1", executiveAmount: 1000, memberAmount: 500, startsOn: "2026-01-01" }).ok).toBe(true);
    const id = db().collections.at(-1)!.id;
    const card = collectionSummaries(actor("mem_finsec")).find((c) => c.id === id)!;
    expect(card.createdByPost).toBe("Sample Chapter A1 Financial Secretary");
    expect(postAt("mem_cfs", new Date().toISOString())).toBe("National Financial Secretary");
    expect(postAt("mem_coord", new Date().toISOString())).toBe("Sample Region A Regional Coordinator");
  });
});

describe("scheduling meetings", () => {
  const future = "2031-03-14T18:00";
  const base = { title: "Example general meeting", startsAt: future, location: "Example hall", agenda: "Welcome\nAccounts" };
  const schedule = (by: string, extra: Record<string, unknown>) => meetings.scheduleMeeting(actor(by), { ...base, ...extra });
  const last = () => db().meetings.at(-1)!;
  const last0 = () => db().meetings[0];

  it("the Chapter Secretary, Regional Coordinator and National Secretary General schedule — each at their own level", () => {
    expect(schedule("mem_sec", { scope: "chapter:ch_a1", audience: "all" }).ok).toBe(true);
    expect(last()).toMatchObject({ scope: { level: "chapter", chapterId: "ch_a1" }, agenda: ["Welcome", "Accounts"], status: "scheduled", startsAt: "2031-03-14T17:00:00.000Z" });
    expect(schedule("mem_sec", { scope: "chapter:ch_a1", audience: "executives" }).ok).toBe(true);
    expect(schedule("mem_sec", { scope: "chapter:ch_a1", audience: "selected", inviteeIds: ["mem_cpres"] }).ok).toBe(false); // not offered at chapter level
    expect(schedule("mem_sec", { scope: "chapter:ch_b1", audience: "all" }).ok).toBe(false); // another chapter
    expect(schedule("mem_coord", { scope: "region:reg_a", audience: "all" }).ok).toBe(true);
    expect(schedule("mem_coord", { scope: "region:reg_a", audience: "executives" }).ok).toBe(false); // region: all members or chosen executives
    expect(schedule("mem_secgen", { scope: "organization", audience: "all" }).ok).toBe(true);
    // Presidents no longer schedule.
    expect(schedule("mem_cpres", { scope: "chapter:ch_a1", audience: "all" }).ok).toBe(false);
    expect(schedule("mem_pg", { scope: "organization", audience: "all" }).ok).toBe(false);
    expect(schedule("mem_member", { scope: "chapter:ch_a1", audience: "all" }).ok).toBe(false);
    expect(schedule("mem_finsec", { scope: "chapter:ch_a1", audience: "all" }).ok).toBe(false);
    expect(schedule("mem_sec", { scope: "chapter:ch_a1", audience: "all", startsAt: "2001-01-01T10:00" }).ok).toBe(false); // in the past
  });

  it("the Regional Coordinator calls chosen executives of the region", () => {
    expect(schedule("mem_coord", { scope: "region:reg_a", audience: "selected", inviteeIds: ["mem_cpres", "mem_member", "mem_s06"] }).ok).toBe(true);
    expect(last().inviteeIds).toEqual(["mem_cpres"]); // only executives of Region A
  });

  it("the National Secretary General calls chosen executives, whole regions and whole chapters", () => {
    expect(schedule("mem_secgen", { scope: "organization", audience: "selected" }).ok).toBe(false); // nobody chosen
    expect(schedule("mem_secgen", { scope: "organization", audience: "selected", inviteeIds: ["mem_cfs"], inviteeChapterIds: ["ch_b1"] }).ok).toBe(true);
    const m = last();
    expect(listMeetings(actor("mem_cfs")).upcoming.some((x) => x.id === m.id)).toBe(true); // chosen executive
    expect(listMeetings(actor("mem_s06")).upcoming.some((x) => x.id === m.id)).toBe(true); // a member of the chosen chapter
    expect(listMeetings(actor("mem_member")).upcoming.some((x) => x.id === m.id)).toBe(false); // A1 was not called
    expect(schedule("mem_secgen", { scope: "organization", audience: "selected", inviteeRegionIds: ["reg_a"] }).ok).toBe(true);
    expect(listMeetings(actor("mem_member")).upcoming.some((x) => x.id === last().id)).toBe(true); // all of Region A
    expect(listNotifications(actor("mem_s06")).some((n) => n.title.includes(m.title))).toBe(true);
  });

  it("a national EXCO meeting is for the chosen executives only", () => {
    expect(schedule("mem_secgen", { scope: "organization", audience: "selected", inviteeIds: ["mem_cfs", "mem_vpg", "mem_member"] }).ok).toBe(true);
    const m = last();
    expect(m.inviteeIds).toEqual(["mem_cfs", "mem_vpg"]); // ordinary members can't be chosen
    expect(listMeetings(actor("mem_cfs")).upcoming.some((x) => x.id === m.id)).toBe(true);
    expect(listMeetings(actor("mem_member")).upcoming.some((x) => x.id === m.id)).toBe(false);
    expect(listMeetings(actor("mem_cpres")).upcoming.some((x) => x.id === m.id)).toBe(false);
    expect(listNotifications(actor("mem_cfs")).some((n) => n.title.includes(m.title))).toBe(true);
  });

  it("Secretaries add documents to a meeting; only the people the meeting is for see them", () => {
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "executives" });
    const m = last();
    const file = { name: "report.pdf", type: "application/pdf", size: 5, bytes: new Uint8Array([37, 80, 68, 70, 45]) };
    expect(meetings.uploadMeetingDocument(actor("mem_cpres"), { meetingId: m.id, title: "Example report" }, file).ok).toBe(false); // the President doesn't
    expect(meetings.uploadMeetingDocument(actor("mem_sec"), { meetingId: m.id, title: "Example report" }, file).ok).toBe(true);
    const doc = db().documents.at(-1)!;
    expect(doc.meetingId).toBe(m.id);
    expect(getMeeting(actor("mem_finsec"), m.id)!.documents.map((d) => d.id)).toContain(doc.id); // an executive
    expect(listDocuments(actor("mem_finsec")).some((d) => d.id === doc.id)).toBe(true);
    expect(listDocuments(actor("mem_member")).some((d) => d.id === doc.id)).toBe(false); // not in the general library either
    expect(getDocumentForDownload(actor("mem_member"), doc.id)).toBeNull();
  });

  it("only Secretaries and Regional Coordinators take attendance", () => {
    for (const id of ["mem_sec"]) expect(can(actor(id), "RECORD_ATTENDANCE", A1, org())).toBe(true);
    expect(can(actor("mem_coord"), "RECORD_ATTENDANCE", { regionId: "reg_a" }, org())).toBe(true);
    expect(can(actor("mem_secgen"), "RECORD_ATTENDANCE", { organization: true }, org())).toBe(true);
    expect(can(actor("mem_cpres"), "RECORD_ATTENDANCE", A1, org())).toBe(false);
    expect(can(actor("mem_a1_vp"), "RECORD_ATTENDANCE", A1, org())).toBe(false);
    expect(can(actor("mem_pg"), "RECORD_ATTENDANCE", { organization: true }, org())).toBe(false);
  });

  it("the attendance register covers chapter, regional and national meetings once they have started", () => {
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "all" });
    const chapterMeeting = last();
    schedule("mem_coord", { scope: "region:reg_a", audience: "all" });
    const regional = last();
    schedule("mem_secgen", { scope: "organization", audience: "all" });
    const national = last();
    const ids = (who: string) => (attendanceRegister(actor(who))?.meetings ?? []).map((r) => r.meeting.id);
    expect(ids("mem_coord")).not.toContain(regional.id); // still upcoming
    for (const m of [chapterMeeting, regional, national]) m.startsAt = "2020-01-01T10:00:00.000Z";
    expect(ids("mem_sec")).toContain(chapterMeeting.id);
    expect(ids("mem_coord")).toEqual(expect.arrayContaining([chapterMeeting.id, regional.id]));
    expect(ids("mem_secgen")).toContain(national.id);
    const row = attendanceRegister(actor("mem_coord"))!.meetings.find((r) => r.meeting.id === regional.id)!;
    expect(row).toMatchObject({ canRecord: true, recorded: 0 });
    expect(row.invited).toBeGreaterThan(0);
    expect(attendanceRegister(actor("mem_member"))).toBeNull(); // ordinary members see only their own record
    national.status = "cancelled";
    expect(ids("mem_secgen")).not.toContain(national.id);
  });

  it("reminders go out the day before and on the morning of a meeting, each once", () => {
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "executives" }); // 14 Mar 2031, 18:00 WAT
    const m = last();
    expect(m.remindersSent).toEqual([]);
    const reminders = () => db().notifications.filter((n) => n.link === `/dashboard/meetings/${m.id}` && n.type === "meeting_reminder" && /^(Today|Tomorrow)/.test(n.title));
    expect(meetings.sendDueReminders(new Date("2031-03-12T12:00:00Z"))).toBe(0); // two days before: nothing
    meetings.sendDueReminders(new Date("2031-03-13T18:00:00Z")); // 24 hours before
    expect(reminders().map((n) => n.title)).toEqual(expect.arrayContaining([`Tomorrow: ${m.title}`]));
    const afterDay = reminders().length;
    expect(afterDay).toBeGreaterThan(0);
    // Each executive gets one (the Secretary too), ordinary members none.
    expect(reminders().some((n) => n.audience.kind === "member" && n.audience.memberId === "mem_member")).toBe(false);
    expect(reminders().some((n) => n.audience.kind === "member" && n.audience.memberId === "mem_sec")).toBe(true);
    meetings.sendDueReminders(new Date("2031-03-13T20:00:00Z"));
    expect(reminders().length).toBe(afterDay); // not twice
    meetings.sendDueReminders(new Date("2031-03-14T05:30:00Z")); // 06:30 WAT: too early
    expect(reminders().length).toBe(afterDay);
    meetings.sendDueReminders(new Date("2031-03-14T06:00:00Z")); // 07:00 WAT on the day
    expect(reminders().filter((n) => n.title === `Today: ${m.title}`).length).toBe(afterDay);
    expect(meetings.sendDueReminders(new Date("2031-03-14T16:00:00Z"))).toBe(0);
    expect(m.remindersSent).toEqual(["day", "morning"]);
  });

  it("no reminder for what people were just told; a new time starts the reminders over; cancelled meetings get none", () => {
    expect(meetings.remindersDue({ ...last0(), startsAt: "2031-03-14T17:00:00.000Z" }, new Date("2031-03-14T08:00:00Z"))).toEqual(["day", "morning"]);
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "all" });
    const m = last();
    meetings.sendDueReminders(new Date("2031-03-13T18:00:00Z"));
    expect(m.remindersSent).toEqual(["day"]);
    expect(meetings.updateMeeting(actor("mem_sec"), { meetingId: m.id, ...base, startsAt: "2031-03-21T18:00" }).ok).toBe(true);
    expect(m.remindersSent).toEqual([]);
    expect(meetings.cancelMeeting(actor("mem_sec"), { meetingId: m.id, reason: "Postponed indefinitely" }).ok).toBe(true);
    expect(meetings.sendDueReminders(new Date("2031-03-21T06:00:00Z"))).toBe(0);
  });

  it("an executives-only meeting is for those holding a post there", () => {
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "executives" });
    const m = last();
    expect(listMeetings(actor("mem_finsec")).upcoming.some((x) => x.id === m.id)).toBe(true);
    expect(listMeetings(actor("mem_member")).upcoming.some((x) => x.id === m.id)).toBe(false);
  });

  it("the post that schedules at the meeting's level changes, cancels and marks it held; officers above only see it", () => {
    schedule("mem_sec", { scope: "chapter:ch_a1", audience: "all" });
    const m = last();
    expect(meetings.updateMeeting(actor("mem_member"), { meetingId: m.id, ...base, location: "Elsewhere" }).ok).toBe(false);
    expect(meetings.updateMeeting(actor("mem_sec"), { meetingId: m.id, ...base, location: "The new hall" }).ok).toBe(true);
    expect(m.location).toBe("The new hall");
    // The Chapter President, the coordinator and the President General see it but do not change it.
    for (const who of ["mem_cpres", "mem_coord", "mem_pg"]) {
      expect(getMeeting(actor(who), m.id)!.canEdit).toBe(false);
      expect(meetings.cancelMeeting(actor(who), { meetingId: m.id, reason: "Clashes with the funeral" }).ok).toBe(false);
    }
    expect(meetings.markMeetingHeld(actor("mem_sec"), { meetingId: m.id }).ok).toBe(false); // not started yet
    expect(meetings.cancelMeeting(actor("mem_sec"), { meetingId: m.id, reason: "" }).ok).toBe(false);
    expect(meetings.cancelMeeting(actor("mem_sec"), { meetingId: m.id, reason: "Clashes with the funeral" }).ok).toBe(true);
    expect(m).toMatchObject({ status: "cancelled", cancelReason: "Clashes with the funeral" });
    expect(listNotifications(actor("mem_member")).some((n) => n.title === `Cancelled: ${m.title}`)).toBe(true);
  });

  it("the Secretary writes and publishes minutes; decisions can carry an action for someone the meeting was for", () => {
    schedule("mem_coord", { scope: "region:reg_a", audience: "all" });
    const m = last();
    m.startsAt = "2020-01-01T10:00:00.000Z"; // as if it took place
    expect(meetings.markMeetingHeld(actor("mem_coord"), { meetingId: m.id }).ok).toBe(true);
    // Attendance at a regional meeting: the region's members.
    expect(commands.recordAttendance(actor("mem_coord"), m.id, { mem_member: "present", mem_s06: "present" }).ok).toBe(true);
    expect(db().attendance.filter((x) => x.meetingId === m.id).map((x) => x.memberId)).toEqual(["mem_member"]); // B1 is another region
    const minutes = { meetingId: m.id, discussion: "Example: we planned the cultural day.", resolutions: "Hold it in May" };
    expect(meetings.saveMeetingMinutes(actor("mem_cpres"), { ...minutes, publish: "on" }).ok).toBe(false); // not a Secretary
    expect(meetings.saveMeetingMinutes(actor("mem_sec"), minutes).ok).toBe(false); // a chapter Secretary has no say over regional minutes
    expect(meetings.saveMeetingMinutes(actor("mem_coord"), minutes).ok).toBe(true); // the coordinator writes regional minutes
    expect(getMeeting(actor("mem_member"), m.id)!.minutes).toBeNull(); // drafts are not shown to members
    expect(meetings.saveMeetingMinutes(actor("mem_coord"), { ...minutes, publish: "on" }).ok).toBe(true);
    expect(getMeeting(actor("mem_member"), m.id)!.minutes).toMatchObject({ status: "published", resolutions: ["Hold it in May"] });
    expect(meetings.saveMeetingMinutes(actor("mem_coord"), minutes).ok).toBe(false); // final once published
    const decision = { meetingId: m.id, text: "Example: hold the cultural day in May", actionTitle: "Book the venue", assigneeId: "mem_member", dueDate: "2031-04-01" };
    expect(meetings.addDecision(actor("mem_member"), decision).ok).toBe(false);
    expect(meetings.addDecision(actor("mem_coord"), { ...decision, assigneeId: "mem_s06" }).ok).toBe(false); // not someone the meeting was for
    expect(meetings.addDecision(actor("mem_coord"), decision).ok).toBe(true);
    expect(db().actionItems.at(-1)).toMatchObject({ title: "Book the venue", assigneeId: "mem_member", status: "pending" });
    expect(listNotifications(actor("mem_member")).some((n) => n.title === "Action for you: Book the venue")).toBe(true);
    // Only the Secretary who keeps them (here the coordinator) marks actions complete — not the person responsible, nor a President.
    const item = db().actionItems.at(-1)!;
    expect(getMeeting(actor("mem_member"), m.id)!.decisions.at(-1)!.actions[0].canComplete).toBe(false);
    expect(commands.completeActionItem(actor("mem_member"), item.id).ok).toBe(false);
    expect(commands.completeActionItem(actor("mem_pg"), item.id).ok).toBe(false);
    expect(meetings.addDecision(actor("mem_pg"), decision).ok).toBe(false); // nor records decisions
    expect(getMeeting(actor("mem_coord"), m.id)!.decisions.at(-1)!.actions[0].canComplete).toBe(true);
    expect(commands.completeActionItem(actor("mem_coord"), item.id).ok).toBe(true);
    for (const id of ["mem_sec", "mem_secgen", "mem_coord"]) expect(hasAnywhere(actor(id), "COMPLETE_ACTION_ITEM")).toBe(true);
    for (const id of ["mem_cpres", "mem_a1_vp", "mem_pg"]) expect(hasAnywhere(actor(id), "COMPLETE_ACTION_ITEM")).toBe(false);
  });
});

describe("contact details", () => {
  it("officers see a person's email and phone wherever they see them; ordinary members see names only", async () => {
    const { contactFor } = await import("@/lib/portal/contacts");
    const member = db().members.find((m) => m.id === "mem_s03")!;
    expect(contactFor(actor("mem_finsec"), "mem_s03")).toEqual({ email: member.email, phone: member.phone ?? null });
    expect(contactFor(actor("mem_pg"), "mem_s03")?.email).toBe(member.email);
    expect(contactFor(actor("mem_member"), "mem_s03")).toBeNull();
  });

  it("committee officers see contacts too; ordinary committee members do not", async () => {
    const { contactFor } = await import("@/lib/portal/contacts");
    commands.createCollection(actor("mem_coord"), { name: "Example contacts project", description: "Example purpose", scope: "region:reg_a", executiveAmount: 1000, memberAmount: 1000, startsOn: "2026-01-01" });
    const collectionId = db().collections.at(-1)!.id;
    expect(committees.createCommittee(actor("mem_coord"), { name: "Example contacts committee", scope: "region:reg_a", collectionId }).ok).toBe(true);
    const c = db().committees!.at(-1)!;
    expect(committees.addCommitteeMember(actor("mem_coord"), { committeeId: c.id, memberId: "mem_member", position: "SECRETARY" }).ok).toBe(true);
    expect(committees.addCommitteeMember(actor("mem_coord"), { committeeId: c.id, memberId: "mem_s03", position: "" }).ok).toBe(true);
    expect(contactFor(actor("mem_member"), "mem_s03")).not.toBeNull(); // the committee Secretary
    expect(contactFor(actor("mem_s03"), "mem_member")).toBeNull(); // an ordinary committee member
    committees.dissolveCommittee(actor("mem_coord"), { committeeId: c.id, reason: "Purpose served" });
    expect(contactFor(actor("mem_member"), "mem_s03")).toBeNull(); // no longer an officer
  });
});

describe("controlled enrolment", () => {
  const input = { fullName: "Test Person", email: "test.person@example.invalid", chapterId: "ch_a1", password: "Temp-pass-123", registrationAmount: "5,000" };

  it("registering a member records the chapter's registration fee, paid in full, with a receipt — the member is active at once", () => {
    const fs = actor("mem_finsec");
    expect(commands.createMember(fs, { ...input, registrationAmount: 1 }).ok).toBe(true); // a typed amount is ignored
    const member = db().members.at(-1)!;
    const year = new Date().getFullYear();
    const fee = db().contributions.at(-1)!;
    expect(fee).toMatchObject({ memberId: member.id, chapterId: "ch_a1", ledger: "chapter", type: "contribution", amount: 5000, registrationFee: { year }, status: "recorded", recordedBy: "mem_finsec" });
    expect(fee.reference).toMatch(/^RC-/);
    expect(scopedContributions(fs)!.rows.find((r) => r.id === fee.id)).toMatchObject({ kind: "registration", collectionName: null }); // its own category, not a project
    expect(actor(member.id).inactive).toBeNull();
    // A yearly renewal opened later in the same year: the joining fee already covers it.
    expect(commands.startRegistrationRenewal(actor("mem_pg"), { year, confirm: "on" }).ok).toBe(true);
    expect(registrationStanding(member.id).registered).toBe(true);
    // A chapter without a registration amount cannot register anyone yet.
    db().chapters.find((c) => c.id === "ch_a1")!.registrationFee = undefined;
    expect(commands.createMember(fs, { ...input, email: "another@example.invalid" }).ok).toBe(false);
    fee.registrationFee = { year: year - 1 }; // …but a fee from another year does not
    expect(registrationStanding(member.id)?.registered).toBe(false);
  });

  it("phone numbers accept digits, spaces, hyphens and a leading + — never letters", () => {
    const fs = actor("mem_finsec");
    const bad = commands.createMember(fs, { ...input, phone: "jk gt" });
    expect(!bad.ok && bad.fieldErrors?.phone).toBeTruthy();
    expect(commands.createMember(fs, { ...input, phone: "6 77 12+34 56" }).ok).toBe(false); // + only at the start
    const short = commands.createMember(fs, { ...input, phone: "12345" });
    expect(!short.ok && short.fieldErrors?.phone).toBe("Enter at least 6 digits.");
    // Nested fields (a chapter's founding officers) are named in full, so the right box is highlighted.
    const chapter = commands.createChapter(actor("mem_coord"), {
      name: "Example USA", location: "Boston", regionId: "reg_a",
      president: { mode: "new", fullName: "Example CP", email: "cp.usa@example.invalid", phone: "654321098", password: "0000" },
      financialSecretary: { mode: "new", fullName: "Example FS", email: "fs.usa@example.invalid", phone: "12345", password: "0000" },
    });
    expect(!chapter.ok && chapter.fieldErrors).toEqual({ "financialSecretary.phone": "Enter at least 6 digits." });
    expect(commands.createMember(fs, { ...input, phone: "+237 6 77-12-34-56" }).ok).toBe(true);
    expect(commands.updateProfile(actor("mem_member"), { fullName: "Sample Member", email: "member@demo.ncuda.invalid", phone: "abc" }).ok).toBe(false);
  });

  it("the President General, coordinators and ordinary members do not enrol local members", () => {
    expect(commands.createMember(actor("mem_pg"), input).ok).toBe(false);
    expect(commands.createMember(actor("mem_coord"), input).ok).toBe(false);
    expect(commands.createMember(actor("mem_member"), input).ok).toBe(false);
  });

  it("the Financial Secretary registers members in their own chapter only, and it is audited", () => {
    expect(commands.createMember(actor("mem_cpres"), input).ok).toBe(false); // the Chapter President no longer registers
    const fs = actor("mem_finsec");
    expect(commands.createMember(fs, { ...input, chapterId: "ch_b1" }).ok).toBe(false);
    expect(commands.createMember(fs, input).ok).toBe(true);
    const created = db().members.find((m) => m.email === input.email)!;
    expect(created.createdBy).toBe("mem_finsec");
    expect(db().audit.at(-1)).toMatchObject({ action: "CREATE", entityType: "member", entityId: created.id });
  });
});

describe("suspension", () => {
  const suspend = (by: string, memberId: string) =>
    commands.setMemberStatus(actor(by), { memberId, status: "suspended", reason: "Example: pending review" });

  it("a Chapter President suspends a member, who immediately loses access; reinstating restores it", () => {
    expect(suspend("mem_cpres", "mem_finsec").ok).toBe(true);
    expect(buildActor("mem_finsec")).toBeNull(); // cannot sign in or act
    expect(db().assignments.some((a) => a.memberId === "mem_finsec" && a.status === "active")).toBe(true); // office kept
    expect(db().audit.at(-1)).toMatchObject({ action: "UPDATE", entityType: "member_status", oldValues: { status: "active" }, newValues: { status: "suspended" } });

    const r = commands.setMemberStatus(actor("mem_cpres"), { memberId: "mem_finsec", status: "active", reason: "Review completed" });
    expect(r.ok).toBe(true);
    expect(can(actor("mem_finsec"), "RECORD_CONTRIBUTION", A1, org())).toBe(true);
  });

  it("a reason is required", () => {
    expect(commands.setMemberStatus(actor("mem_cpres"), { memberId: "mem_s01", status: "suspended", reason: "" }).ok).toBe(false);
  });

  it("nobody can suspend themselves or members of another chapter", () => {
    expect(suspend("mem_cpres", "mem_cpres").ok).toBe(false);
    expect(suspend("mem_cpres", "mem_s07").ok).toBe(false); // B1
  });

  it("ordinary members, secretaries and coordinators cannot suspend", () => {
    expect(suspend("mem_member", "mem_s01").ok).toBe(false);
    expect(suspend("mem_sec", "mem_s01").ok).toBe(false);
    expect(suspend("mem_coord", "mem_s01").ok).toBe(false);
  });

  it("officers can only be suspended by whoever appoints their office", () => {
    // The President General appoints Chapter Presidents, so may suspend one …
    expect(suspend("mem_pg", "mem_s06").ok).toBe(true); // B1 President
    // … and a Chapter President cannot suspend the President General (who sits in a chapter too).
    expect(suspend("mem_s08", "mem_pg").ok).toBe(false);
  });
});

describe("regions and chapters", () => {
  const newPerson = (fullName: string, email: string) => ({ mode: "new", fullName, email, password: "Temp-pass-123" });
  const chapter = {
    name: "Sample Chapter New",
    location: "Sample town N",
    regionId: "reg_b",
    president: newPerson("Founding President", "founder@example.invalid"),
    financialSecretary: newPerson("Founding FinSec", "fs.new@example.invalid"),
    exco: {},
  };

  it("a chapter needs a Financial Secretary as well as a President — two different people", () => {
    const noFs = { ...chapter, name: "Example no FS", financialSecretary: { mode: "new", fullName: "", email: "" } };
    expect(commands.createChapter(actor("mem_coord_b"), noFs).ok).toBe(false);
    const same = { ...chapter, name: "Example same", president: { mode: "existing", memberId: "mem_b2_m2" }, financialSecretary: { mode: "existing", memberId: "mem_b2_m2" } };
    expect(commands.createChapter(actor("mem_coord_b"), same).ok).toBe(false);
    // An existing member can be the Financial Secretary (and moves into the chapter).
    const existingFs = { ...chapter, name: "Example existing FS", financialSecretary: { mode: "existing", memberId: "mem_b2_m2" } };
    expect(commands.createChapter(actor("mem_coord_b"), existingFs).ok).toBe(true);
    const ch = db().chapters.at(-1)!;
    const fs = actor("mem_b2_m2");
    expect(fs.chapterId).toBe(ch.id);
    expect(fs.roles.map((r) => r.role.key)).toEqual(["FINANCIAL_SECRETARY"]);
    expect(commands.createMember(fs, { fullName: "Example First", email: "example.first@example.invalid", chapterId: ch.id, password: "1" }).ok).toBe(false); // no amount yet
    expect(commands.setChapterRegistrationFee(fs, { chapterId: ch.id, amount: 5000 }).ok).toBe(true);
    expect(commands.createMember(fs, { fullName: "Example First", email: "example.first@example.invalid", chapterId: ch.id, password: "1" }).ok).toBe(true);
  });

  it("a region's chapters are created by that region's coordinator — not the President General, nor other coordinators", () => {
    expect(commands.createChapter(actor("mem_pg"), chapter).ok).toBe(false);
    expect(commands.createChapter(actor("mem_coord"), chapter).ok).toBe(false); // Region A coordinator
    expect(commands.createChapter(actor("mem_cpres"), chapter).ok).toBe(false);
  });

  it("the President General creates a region with a NEW coordinator, who then creates its chapters", () => {
    const region = { name: "Example Littoral", coordinator: newPerson("New Coordinator", "new.coord@example.invalid") };
    expect(commands.createRegion(actor("mem_coord"), region).ok).toBe(false); // only the President General
    expect(commands.createRegion(actor("mem_pg"), region).ok).toBe(true);
    expect(commands.createRegion(actor("mem_pg"), { ...region, coordinator: newPerson("Someone", "someone@example.invalid") }).ok).toBe(false); // name taken
    const reg = db().regions.at(-1)!;
    const coord = db().members.find((m) => m.email === "new.coord@example.invalid")!;
    const a = actor(coord.id); // signs in although not yet in a chapter
    expect(a.chapterId).toBeNull();
    expect(a.roles.map((r) => r.role.key)).toEqual(["REGIONAL_COORDINATOR"]);
    // The President General cannot create chapters inside the region; its coordinator does.
    const first = { ...chapter, name: "Example Douala chapter", regionId: reg.id, president: newPerson("Douala President", "douala.pres@example.invalid"), exco: {} };
    expect(commands.createChapter(actor("mem_pg"), first).ok).toBe(false);
    expect(commands.createChapter(a, first).ok).toBe(true);
    // The region now has a chapter: everyone must belong to one, so the coordinator can only join.
    const waiting = actor(coord.id);
    expect(waiting.mustJoinChapter).toBe(true);
    expect(waiting.grants.every((g) => g.permission === "TRANSFER_MEMBER")).toBe(true);
    expect(hasAnywhere(waiting, "CREATE_CHAPTER")).toBe(false);
    const douala = db().chapters.find((c) => c.name === "Example Douala chapter")!;
    expect(transferOptions(waiting, coord.id)!.destinations.map((c) => c.id)).toEqual([douala.id]); // their region's chapters only
    expect(commands.transferMember(waiting, { memberId: coord.id, toChapterId: douala.id }).ok).toBe(true);
    // In a chapter (registration still unpaid): setup powers are back.
    const joined = actor(coord.id);
    expect(joined.mustJoinChapter).toBe(false);
    expect(hasAnywhere(joined, "CREATE_CHAPTER")).toBe(true);
    expect(listChaptersFor(coord.id)).toContain("Example Douala chapter");
  });

  it("a coordinator appointed to a region that already has chapters must join one first", () => {
    const input = { regionId: "reg_a", coordinator: newPerson("Second Coordinator", "second.coord@example.invalid") };
    // End the current coordinator's appointment so a new one can be appointed.
    for (const x of db().assignments) if (x.roleKey === "REGIONAL_COORDINATOR" && x.scope.level === "region" && x.scope.regionId === "reg_a") x.status = "ended";
    expect(commands.appointRegionCoordinator(actor("mem_pg"), input).ok).toBe(true);
    const coord = actor(db().members.find((m) => m.email === "second.coord@example.invalid")!.id);
    expect(coord.mustJoinChapter).toBe(true);
    expect(hasAnywhere(coord, "CREATE_CHAPTER")).toBe(false);
  });

  it("…but not with an existing member: a coordinator belongs to a chapter of their region, and a new region has none yet", () => {
    // mem_d_m1 is an ordinary member (no post) of the diaspora chapter.
    expect(commands.createRegion(actor("mem_pg"), { name: "Example Centre", coordinator: { mode: "existing", memberId: "mem_d_m1" } }).ok).toBe(false);
    expect(commands.createRegion(actor("mem_pg"), { name: "Example Self", coordinator: { mode: "existing", memberId: "mem_pg" } }).ok).toBe(false); // not yourself
  });

  it("a region without a coordinator gets one appointed — once", () => {
    db().regions.push({ id: "reg_empty", name: "Example empty region" });
    const input = { regionId: "reg_empty", coordinator: newPerson("Empty Coordinator", "empty.coord@example.invalid") };
    expect(commands.appointRegionCoordinator(actor("mem_coord"), input).ok).toBe(false);
    expect(commands.appointRegionCoordinator(actor("mem_pg"), input).ok).toBe(true);
    expect(commands.appointRegionCoordinator(actor("mem_pg"), { ...input, coordinator: newPerson("Another", "another@example.invalid") }).ok).toBe(false);
  });

  it("the President General creates no chapters at all — every chapter belongs to a region and is created by its coordinator", () => {
    const direct = { ...chapter, name: "Sample Direct Chapter", regionId: "", president: newPerson("Direct President", "direct@example.invalid"), exco: {} };
    expect(commands.createChapter(actor("mem_pg"), direct).ok).toBe(false);
    expect(commands.createChapter(actor("mem_coord_b"), direct).ok).toBe(false); // a region is required
    expect(hasAnywhere(actor("mem_pg"), "CREATE_CHAPTER")).toBe(false);
    // The President General still sees every chapter (read-only).
    expect(listChapters(actor("mem_pg"))!.chapters.length).toBe(db().chapters.length);
    expect(listChapters(actor("mem_pg"))!.regions).toEqual([]);
  });

  it("a chapter must start with a President", () => {
    const r = commands.createChapter(actor("mem_coord_b"), { ...chapter, president: { mode: "new", fullName: "", email: "" } });
    expect(r.ok).toBe(false);
  });

  it("an existing member can be made President of a new chapter — and moves into it", () => {
    // mem_b2_m1 is an ordinary member of B2 (Region B), visible to the Region B coordinator.
    const input = { ...chapter, name: "Example moved chapter", president: { mode: "existing", memberId: "mem_b2_m1" }, exco: {} };
    expect(commands.createChapter(actor("mem_coord_b"), input).ok).toBe(true);
    const ch = db().chapters.find((c) => c.name === "Example moved chapter")!;
    const p = actor("mem_b2_m1");
    expect(p.chapterId).toBe(ch.id);
    expect(p.roles.map((r) => r.role.key)).toEqual(["CHAPTER_PRESIDENT"]);
    // Their old membership is closed, not erased.
    expect(db().affiliations.filter((a) => a.memberId === "mem_b2_m1").map((a) => [a.chapterId, a.endedAt === null])).toEqual([
      ["ch_b2", false],
      [ch.id, true],
    ]);
    // Someone holding another chapter's office, or outside the coordinator's view, cannot be taken.
    expect(commands.createChapter(actor("mem_coord_b"), { ...input, name: "Example 2", president: { mode: "existing", memberId: "mem_b2_fs" } }).ok).toBe(false);
    expect(commands.createChapter(actor("mem_coord_b"), { ...input, name: "Example 3", president: { mode: "existing", memberId: "mem_a1_m1" } }).ok).toBe(false);
  });

  it("creates the chapter with its founding EXCO, who then run it", () => {
    expect(commands.createChapter(actor("mem_coord_b"), chapter).ok).toBe(true);
    const ch = db().chapters.find((c) => c.name === "Sample Chapter New")!;
    const founder = db().members.find((m) => m.email === "founder@example.invalid")!;
    const president = actor(founder.id);
    expect(president.chapterId).toBe(ch.id);
    expect(president.roles.map((r) => r.role.key)).toEqual(["CHAPTER_PRESIDENT"]);
    // The founding Financial Secretary registers members in the new chapter and records their payments.
    const fs = actor(db().members.find((m) => m.email === "fs.new@example.invalid")!.id);
    // Founding officers are inactive until they pay; the FS sets the chapter's amount and records it.
    expect(fs.inactive).toBeTruthy();
    expect(president.inactive).toBeTruthy();
    expect(commands.setChapterRegistrationFee(president, { chapterId: ch.id, amount: 5000 }).ok).toBe(false);
    expect(commands.setChapterRegistrationFee(fs, { chapterId: ch.id, amount: 5000 }).ok).toBe(true);
    expect(commands.createMember(president, { fullName: "First Member", email: "first@example.invalid", chapterId: ch.id, password: "Temp-pass-789" }).ok).toBe(false);
    expect(commands.createMember(fs, { fullName: "First Member", email: "first@example.invalid", chapterId: ch.id, password: "Temp-pass-789" }).ok).toBe(true);
    for (const id of [fs.member.id, founder.id]) expect(commands.recordContribution(fs, { memberId: id, type: "contribution", collectionId: "registration", receivedOn: new Date().toISOString().slice(0, 10) }).ok).toBe(true);
    expect(actor(fs.member.id).inactive).toBeNull();
    expect(actor(founder.id).inactive).toBeNull();
    expect(can(fs, "RECORD_CONTRIBUTION", { chapterId: ch.id }, org())).toBe(true);
    expect(db().audit.filter((e) => e.chapterId === ch.id && e.action === "ASSIGN_ROLE")).toHaveLength(2);
  });
});

/** Names of the chapters a member's Chapters page lists. */
function listChaptersFor(memberId: string) {
  return (listChapters(actor(memberId))?.chapters ?? []).map((c) => c.name);
}

describe("messages & notifications", () => {
  it("the President General can message all Chapter Presidents — and only they receive it", () => {
    const r = commands.sendMessage(actor("mem_pg"), { scope: "organization", roleKeys: ["CHAPTER_PRESIDENT"], title: "Hello presidents", body: "A message for chapter presidents only." });
    expect(r.ok).toBe(true);
    const sent = db().notifications.at(-1)!;
    expect(listNotifications(actor("mem_cpres")).some((n) => n.id === sent.id)).toBe(true);
    expect(listNotifications(actor("mem_s06")).some((n) => n.id === sent.id)).toBe(true); // B1 president
    expect(listNotifications(actor("mem_member")).some((n) => n.id === sent.id)).toBe(false);
    expect(listNotifications(actor("mem_finsec")).some((n) => n.id === sent.id)).toBe(false);
  });

  it("officers can only message within their own scope", () => {
    const cp = actor("mem_cpres");
    expect(commands.sendMessage(cp, { scope: "chapter:ch_a1", roleKeys: [], title: "Chapter notice", body: "For our chapter." }).ok).toBe(true);
    expect(commands.sendMessage(cp, { scope: "organization", roleKeys: [], title: "Too wide", body: "Not allowed." }).ok).toBe(false);
    expect(commands.sendMessage(actor("mem_member"), { scope: "chapter:ch_a1", roleKeys: [], title: "Hi", body: "Members cannot broadcast." }).ok).toBe(false);
  });

  it("reading a notification marks it read for that member only", () => {
    const m = actor("mem_member");
    const unread = () => listNotifications(actor("mem_member")).filter((n) => !n.read).length;
    const before = unread();
    const first = listNotifications(m).find((n) => !n.read)!;
    commands.markNotificationsRead(m, [first.id]);
    expect(unread()).toBe(before - 1);
    expect(listNotifications(actor("mem_cpres")).find((n) => n.id === first.id)?.read ?? false).toBe(false);
  });

  it("a Chapter President forwards the President General's message, unchanged, to their chapter", () => {
    const cp = actor("mem_cpres");
    // nt_8: the President General's message to all Chapter Presidents.
    const r = commands.forwardMessage(cp, { notificationId: "nt_8", scope: "chapter:ch_a1", roleKeys: [], note: "Please read — from the PG." });
    expect(r.ok).toBe(true);
    const fwd = db().notifications.at(-1)!;
    const original = db().notifications.find((n) => n.id === "nt_8")!;
    expect(fwd.title).toBe(original.title);
    expect(fwd.body).toBe(original.body);
    expect(fwd.forward).toMatchObject({ originalId: "nt_8", originalSenderId: "mem_pg", note: "Please read — from the PG." });
    // An ordinary member of A1 now has it, showing who forwarded it and who wrote it.
    const seen = listNotifications(actor("mem_member")).find((n) => n.id === fwd.id)!;
    expect(seen.forwardInfo).toMatchObject({ originalSenderName: "Demo President General", forwardedByName: "Demo Chapter President" });
    // B1 members did not receive it.
    expect(listNotifications(actor("mem_s07")).some((n) => n.forward?.originalId === "nt_8")).toBe(false);
  });

  it("forwarding is limited to the forwarder's own authority", () => {
    const cp = actor("mem_cpres");
    expect(commands.forwardMessage(cp, { notificationId: "nt_8", scope: "chapter:ch_b1", roleKeys: [] }).ok).toBe(false);
    expect(commands.forwardMessage(cp, { notificationId: "nt_8", scope: "organization", roleKeys: [] }).ok).toBe(false);
  });

  it("ordinary members cannot forward, and nobody can forward a message they never received", () => {
    expect(commands.forwardMessage(actor("mem_cpres"), { notificationId: "nt_8", scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(true);
    const fwdId = db().notifications.at(-1)!.id;
    expect(commands.forwardMessage(actor("mem_member"), { notificationId: fwdId, scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(false);
    // nt_7 is a B1-only notice the A1 Secretary never received.
    expect(commands.forwardMessage(actor("mem_sec"), { notificationId: "nt_7", scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(false);
  });

  it("a forward of a forward still points at the original and records the chain", () => {
    expect(commands.forwardMessage(actor("mem_cpres"), { notificationId: "nt_8", scope: "chapter:ch_a1", roleKeys: ["CHAPTER_SECRETARY"] }).ok).toBe(true);
    const first = db().notifications.at(-1)!;
    // The Secretary received the forward and passes it on to the rest of the chapter.
    const r = commands.forwardMessage(actor("mem_sec"), { notificationId: first.id, scope: "chapter:ch_a1", roleKeys: [] });
    expect(r.ok).toBe(true);
    const second = db().notifications.at(-1)!;
    expect(second.forward).toMatchObject({ originalId: "nt_8", originalSenderId: "mem_pg", via: ["mem_cpres"] });
    expect(second.body).toBe(db().notifications.find((n) => n.id === "nt_8")!.body);
  });

  it("people who already have the message do not get duplicates", () => {
    const cp = actor("mem_cpres");
    expect(commands.forwardMessage(cp, { notificationId: "nt_8", scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(true);
    // Forwarding again to the same people is refused …
    expect(commands.forwardMessage(cp, { notificationId: "nt_8", scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(false);
    // … and the President's own inbox shows the message once.
    expect(listNotifications(actor("mem_cpres")).filter((n) => (n.forward?.originalId ?? n.id) === "nt_8")).toHaveLength(1);
  });

  it("cannot mark someone else's notification as read", () => {
    commands.markNotificationsRead(actor("mem_member"), ["nt_7"]); // B1-only notice
    expect(db().notificationReads.some((r) => r.notificationId === "nt_7")).toBe(false);
  });
});

describe("documents & attachments", () => {
  const pdf = (name = "report.pdf") => ({ name, type: "application/pdf", size: 1200, bytes: new Uint8Array(1200) });

  it("an uploader chooses who can view a document, and only they are notified and see it", () => {
    const cp = actor("mem_cpres");
    const r = commands.uploadDocument(cp, { title: "Treasury handover notes", category: "reports", scope: "chapter:ch_a1", roleKeys: ["TREASURER", "FINANCIAL_SECRETARY"] }, pdf());
    expect(r.ok).toBe(true);
    const doc = db().documents.find((d) => d.title === "Treasury handover notes")!;
    const notice = db().notifications.find((n) => n.type === "document_uploaded" && n.title.includes("Treasury handover notes"))!;
    // The Treasurer and Financial Secretary see it and are notified …
    for (const id of ["mem_treas", "mem_finsec"]) {
      expect(listDocuments(actor(id)).some((d) => d.id === doc.id)).toBe(true);
      expect(listNotifications(actor(id)).some((n) => n.id === notice.id)).toBe(true);
    }
    // … an ordinary member and the Secretary do not.
    for (const id of ["mem_member", "mem_sec"]) {
      expect(listDocuments(actor(id)).some((d) => d.id === doc.id)).toBe(false);
      expect(listNotifications(actor(id)).some((n) => n.id === notice.id)).toBe(false);
    }
  });

  it("uploads are limited to the uploader's own scope and to supported files", () => {
    const cp = actor("mem_cpres");
    expect(commands.uploadDocument(cp, { title: "Other chapter", category: "other", scope: "chapter:ch_b1", roleKeys: [] }, pdf()).ok).toBe(false);
    expect(commands.uploadDocument(actor("mem_member"), { title: "Member upload", category: "other", scope: "chapter:ch_a1", roleKeys: [] }, pdf()).ok).toBe(false);
    expect(commands.uploadDocument(cp, { title: "Script", category: "other", scope: "chapter:ch_a1", roleKeys: [] }, { ...pdf("x.exe"), type: "application/x-msdownload" }).ok).toBe(false);
    expect(commands.uploadDocument(cp, { title: "Huge", category: "other", scope: "chapter:ch_a1", roleKeys: [] }, { ...pdf(), size: 11 * 1024 * 1024 }).ok).toBe(false);
  });

  it("message attachments are visible exactly to the message's recipients — including via forwards", () => {
    const r = commands.sendMessage(
      actor("mem_pg"),
      { scope: "organization", roleKeys: ["CHAPTER_PRESIDENT"], title: "Budget template", body: "Please use the attached template." },
      [pdf("budget-template.pdf")],
    );
    expect(r.ok).toBe(true);
    const msg = db().notifications.at(-1)!;
    const docId = msg.attachmentIds![0];
    expect(getDocumentForDownload(actor("mem_cpres"), docId)).not.toBeNull();
    expect(getDocumentForDownload(actor("mem_member"), docId)).toBeNull();
    // Once the Chapter President forwards the message to the chapter, members can open the attachment too.
    expect(commands.forwardMessage(actor("mem_cpres"), { notificationId: msg.id, scope: "chapter:ch_a1", roleKeys: [] }).ok).toBe(true);
    expect(getDocumentForDownload(actor("mem_member"), docId)).not.toBeNull();
    expect(getDocumentForDownload(actor("mem_s07"), docId)).toBeNull(); // B1
  });
});

describe("attendance", () => {
  it("ordinary members cannot alter official attendance", () => {
    const r = commands.recordAttendance(actor("mem_member"), "mt_4", { mem_member: "present", mem_s01: "present" });
    expect(r.ok).toBe(false);
    expect(db().attendance.find((a) => a.meetingId === "mt_4" && a.memberId === "mem_s01")!.status).toBe("absent");
  });

  it("the Secretary can, and only for members on the chapter roll", () => {
    const r = commands.recordAttendance(actor("mem_sec"), "mt_4", { mem_s01: "late", mem_s07: "present" });
    expect(r.ok).toBe(true);
    expect(db().attendance.find((a) => a.meetingId === "mt_4" && a.memberId === "mem_s01")!.status).toBe("late");
    expect(db().attendance.some((a) => a.meetingId === "mt_4" && a.memberId === "mem_s07")).toBe(false);
  });
});

describe("spreadsheet exports", () => {
  const none = new URLSearchParams();
  const lines = (body: string) => body.replace(/^\uFEFF/, "").trimEnd().split("\r\n");

  it("writes cells safely: quoting, and formulas shown as text (phone numbers untouched)", () => {
    expect(csvCell('Say "hi", then go')).toBe('"Say ""hi"", then go"');
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(csvCell("+237 677 000 000")).toBe("+237 677 000 000");
    expect(csvCell(5000)).toBe("5000");
    expect(toCsv(["A"], [["x"]]).startsWith("\uFEFFA\r\nx")).toBe(true);
  });

  it("members: officers get the members they can see; ordinary members get nothing", () => {
    const file = buildExport(actor("mem_cpres"), "members", none)!;
    const rows = lines(file.body);
    expect(rows[0]).toBe("Name,Member number,Chapter,Posts,Email,Phone,Status,Joined");
    expect(rows.slice(1).every((r) => r.includes("Sample Chapter A1"))).toBe(true);
    expect(file.filename).toMatch(/^ncuda-members-sample-chapter-a1-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(buildExport(actor("mem_member"), "members", none)).toBeNull();
    expect(db().audit.at(-1)).toMatchObject({ action: "EXPORT", actorId: "mem_cpres" });
  });

  it("payments: only the chapters whose records you see, with the page's filters", () => {
    const all = lines(buildExport(actor("mem_finsec"), "payments", none)!.body);
    expect(all.length).toBeGreaterThan(1);
    expect(all.slice(1).every((r) => r.includes("Sample Chapter A1"))).toBe(true);
    const fines = lines(buildExport(actor("mem_finsec"), "payments", new URLSearchParams({ type: "fine" }))!.body);
    expect(fines.slice(1).every((r) => r.split(",")[4] === "Fine")).toBe(true);
    // A chapter outside your scope in the link is ignored, not shown.
    const other = lines(buildExport(actor("mem_finsec"), "payments", new URLSearchParams({ chapter: "ch_b1" }))!.body);
    expect(other.slice(1).some((r) => r.includes("Sample Chapter B1"))).toBe(false);
    expect(buildExport(actor("mem_member"), "payments", none)).toBeNull();
  });

  it("registration and attendance follow their pages' access", () => {
    expect(lines(buildExport(actor("mem_finsec"), "registration", none)!.body)[0]).toBe("Name,Chapter,Executive,Year,Status,Fee (XAF),Paid (XAF),Receipt,Paid on,Recorded by");
    expect(buildExport(actor("mem_member"), "registration", none)).toBeNull();
    expect(buildExport(actor("mem_sec"), "attendance", none)).not.toBeNull();
    expect(buildExport(actor("mem_member"), "attendance", none)).toBeNull();
    const m = db().meetings.find((x) => x.scope.level === "chapter" && x.scope.chapterId === "ch_a1")!;
    expect(buildExport(actor("mem_sec"), "attendance", new URLSearchParams({ meeting: m.id }))).not.toBeNull();
    expect(buildExport(actor("mem_member"), "attendance", new URLSearchParams({ meeting: m.id }))).toBeNull();
  });
});

describe("receipts", () => {
  const today = new Date().toISOString().slice(0, 10);
  const inbox = (who: string) => listNotifications(actor(who)).filter((n) => n.type === "receipt");

  it("every payment sends the payer a receipt; an unpaid fine a notice; a voided record a cancellation with the reason", () => {
    const fs = actor("mem_finsec");
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "fine", description: "Late to the meeting", expectedAmount: 2000, paidNow: "no", receivedOn: today }).ok).toBe(true);
    const fine = db().contributions.at(-1)!;
    const titled = (t: string) => inbox("mem_member").find((n) => n.title === t);
    expect(titled(`Fine imposed · ${formatMoney(2000)}`)?.body).toContain("Late to the meeting");
    expect(commands.recordContribution(fs, { memberId: "mem_member", type: "fine", fineId: fine.id, receivedOn: today }).ok).toBe(true);
    const paid = db().contributions.at(-1)!;
    expect(titled(`Receipt ${paid.reference} · Fine`)?.body).toMatch(/Received FCFA.2,000 from you .* for: Late to the meeting\. Paid in full to Sample Chapter A1\. Recorded by .*Financial Secretary/);
    expect(commands.voidContribution(fs, { id: paid.id, reason: "Entered for the wrong person" }).ok).toBe(true);
    expect(titled(`Cancelled: receipt ${paid.reference}`)?.body).toContain("Reason: Entered for the wrong person");
    expect(inbox("mem_finsec").some((n) => n.title.includes(paid.reference))).toBe(false); // the recorder does not get it
  });

  it("a member registered with their first fee gets its receipt", () => {
    const fs = actor("mem_finsec");
    expect(commands.createMember(fs, { fullName: "Example Receipt Person", email: "receipt.person@example.invalid", phone: "", chapterId: "ch_a1", password: "1" }).ok).toBe(true);
    const person = db().members.find((m) => m.email === "receipt.person@example.invalid")!;
    expect(inbox(person.id).some((n) => n.title.startsWith("Receipt RC-") && n.title.includes("Registration"))).toBe(true);
  });
});

describe("duties follow the post, not the person", () => {
  const today = new Date().toISOString().slice(0, 10);
  /** Ends whoever holds `roleKey` there and gives the post to `memberId`. */
  const handOver = (roleKey: string, from: string, to: string) => {
    const old = db().assignments.find((a) => a.memberId === from && a.roleKey === roleKey && a.status === "active")!;
    old.status = "ended";
    old.endedAt = new Date().toISOString();
    db().assignments.push({ ...old, id: `ra_${to}_${roleKey}`, memberId: to, status: "active", assignedAt: new Date().toISOString(), endedAt: null });
  };

  it("a new Regional Coordinator takes over the region's committees and its project money", () => {
    expect(commands.createCollection(actor("mem_coord"), { name: "Example handover project", description: "Example regional purpose", scope: "region:reg_a", executiveAmount: "2,000", memberAmount: "1,000", startsOn: today }).ok).toBe(true);
    const project = db().collections.at(-1)!.id;
    expect(committees.createCommittee(actor("mem_coord"), { name: "Example handover committee", scope: "region:reg_a", collectionId: project }).ok).toBe(true);
    const c = db().committees!.at(-1)!;
    handOver("REGIONAL_COORDINATOR", "mem_coord", "mem_d_m1");
    // The new coordinator runs it; the former one no longer does (or sees it).
    expect(committees.addCommitteeMember(actor("mem_d_m1"), { committeeId: c.id, memberId: "mem_member", position: "PRESIDENT" }).ok).toBe(true);
    expect(committees.addCommitteeMember(actor("mem_coord"), { committeeId: c.id, memberId: "mem_sec" }).ok).toBe(false);
    expect(committees.listCommittees(actor("mem_coord")).some((x) => x.id === c.id)).toBe(false);
    expect(committees.getCommittee(actor("mem_d_m1"), c.id)!.inCharge.people.map((x) => x.id)).toEqual(["mem_d_m1"]);
    // The committee President writes to the coordinator in office.
    expect(committees.sendCommitteeMessage(actor("mem_member"), { committeeId: c.id, to: "creator", title: "Progress", body: "Our progress report" }).ok).toBe(true);
    expect(listNotifications(actor("mem_d_m1")).some((n) => n.title.includes("Progress"))).toBe(true);
    expect(listNotifications(actor("mem_coord")).some((n) => n.title.includes("Progress"))).toBe(false);
    // Chapters send the regional project's money to the coordinator in office.
    expect(committees.sendableProjects("ch_a1").find((o) => o.value === project)).toMatchObject({ recipientId: "mem_d_m1" });
  });

  it("a Secretary who leaves the post no longer runs — or sees — the meetings they scheduled; the new Secretary does", () => {
    expect(meetings.scheduleMeeting(actor("mem_sec"), { title: "Example executives meeting", startsAt: "2031-05-01T18:00", location: "Example hall", agenda: "", scope: "chapter:ch_a1", audience: "executives" }).ok).toBe(true);
    const m = db().meetings.at(-1)!;
    handOver("CHAPTER_SECRETARY", "mem_sec", "mem_member");
    expect(getMeeting(actor("mem_sec"), m.id)).toBeNull();
    expect(getMeeting(actor("mem_member"), m.id)!.canEdit).toBe(true);
    expect(meetings.updateMeeting(actor("mem_sec"), { meetingId: m.id, title: m.title, startsAt: "2031-05-02T18:00", location: "Elsewhere", agenda: "" }).ok).toBe(false);
  });

  it("a delegation lasts only while whoever granted it holds the post", () => {
    db().delegations.push({ id: "dl_test", grantedBy: "mem_cpres", grantedTo: "mem_member", scope: { level: "chapter", chapterId: "ch_a1" }, permissions: ["VIEW_MEMBER"], startsAt: "2020-01-01T00:00:00Z", endsAt: null, status: "active", createdAt: "2020-01-01T00:00:00Z" });
    expect(can(actor("mem_member"), "VIEW_MEMBER", A1, org())).toBe(true);
    handOver("CHAPTER_PRESIDENT", "mem_cpres", "mem_a1_m1");
    expect(can(actor("mem_member"), "VIEW_MEMBER", A1, org())).toBe(false);
  });
});

describe("chapter order", () => {
  it("chapters are listed alphabetically, numbers in natural order, after the central ledger", () => {
    db().chapters.push({ id: "ch_x10", name: "Example Chapter 10", regionId: "reg_a", location: "X" }, { id: "ch_x2", name: "Example Chapter 2", regionId: "reg_a", location: "X" });
    for (const [id, m] of [["ch_x10", "mem_s03"], ["ch_x2", "mem_s04"]] as const) {
      db().contributions.push({ ...db().contributions.find((c) => c.ledger === "chapter")!, id: `ct_${id}`, chapterId: id, memberId: m, amount: id === "ch_x10" ? 999999 : 1 });
    }
    const groups = scopedContributions(actor("mem_pg"))!.groups.map((g) => g.chapterName);
    const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
    expect(groups[0]).toBe("Central (NCUDA)");
    expect(groups.slice(1)).toEqual([...groups.slice(1)].sort(natural));
    expect(groups.indexOf("Example Chapter 2")).toBeLessThan(groups.indexOf("Example Chapter 10")); // not by amount
    const cards = financialSummary(actor("mem_pg"))!.filter((c) => !c.key.startsWith("region:") && c.key !== "central").map((c) => c.name);
    expect(cards).toEqual([...cards].sort(natural));
  });
});


describe("audit log follows the hierarchy, by post", () => {
  it("officers see their area's actions, but none by a post at a higher level (as held at the time)", () => {
    const entry = (id: string, actorRoles: string[], where: { chapterId?: string; regionId?: string }) =>
      db().audit.push({ id, at: "2031-01-01T10:00:00.000Z", actorId: "mem_s03", actorRoles, action: "UPDATE", entityType: "test", entityId: null, chapterId: where.chapterId ?? null, regionId: where.regionId ?? (where.chapterId ? "reg_a" : null), summary: id });
    entry("tst_member", ["MEMBER"], { chapterId: "ch_a1" });
    entry("tst_chapter_post", ["CHAPTER_VICE_PRESIDENT"], { chapterId: "ch_a1" }); // e.g. a former Chapter Vice President
    entry("tst_regional", ["REGIONAL_COORDINATOR"], { chapterId: "ch_a1" });
    entry("tst_national", ["PRESIDENT_GENERAL"], { chapterId: "ch_a1" });
    entry("tst_region_level", ["REGIONAL_COORDINATOR"], { regionId: "reg_a" });
    entry("tst_other_chapter", ["CHAPTER_PRESIDENT"], { chapterId: "ch_b1" });
    const sees = (who: string) => (listAudit(actor(who)) ?? []).map((e) => e.id).filter((id) => id.startsWith("tst_")).sort();
    expect(sees("mem_cpres")).toEqual(["tst_chapter_post", "tst_member"]);
    expect(sees("mem_a1_vp")).toEqual(["tst_chapter_post", "tst_member"]); // the Vice President holds the President's powers
    expect(sees("mem_coord")).toEqual(["tst_chapter_post", "tst_member", "tst_region_level", "tst_regional"]);
    expect(sees("mem_pg")).toEqual(["tst_chapter_post", "tst_member", "tst_national", "tst_other_chapter", "tst_region_level", "tst_regional"]);
    expect(listAudit(actor("mem_member"))).toBeNull();
  });
});

describe("dates are West Africa Time", () => {
  it("watDate gives the date people see; the records date filter uses it", async () => {
    const { watDate } = await import("@/lib/utils");
    expect(watDate("2026-10-14T23:30:00Z")).toBe("2026-10-15"); // 00:30 WAT on the 15th
    expect(watDate("2026-10-14T12:00:00Z")).toBe("2026-10-14");
    const late = { ...db().contributions.find((c) => c.ledger === "chapter" && c.chapterId === "ch_a1")!, id: "ct_late", reference: "RC-LATE", receivedOn: "2026-10-14T23:30:00Z" };
    db().contributions.push(late);
    const ids = (from: string, to: string) => scopedContributions(actor("mem_finsec"), { from, to })!.rows.map((r) => r.id);
    expect(ids("2026-10-15", "2026-10-15")).toContain("ct_late");
    expect(ids("2026-10-14", "2026-10-14")).not.toContain("ct_late");
    expect(ids("2026-08-15", "2026-09-15").every((id) => id !== "ct_late")).toBe(true);
  });
});

describe("a meeting is run at its own level", () => {
  it("officers above see a chapter meeting but do not take attendance, write minutes or record decisions", () => {
    meetings.scheduleMeeting(actor("mem_sec"), { title: "Example level meeting", startsAt: "2031-06-01T18:00", location: "Example hall", agenda: "", scope: "chapter:ch_a1", audience: "all" });
    const m = db().meetings.at(-1)!;
    m.startsAt = "2020-01-01T10:00:00.000Z";
    for (const who of ["mem_coord", "mem_secgen"]) {
      expect(getMeeting(actor(who), m.id)).not.toBeNull(); // they still see it
      expect(meetings.markMeetingHeld(actor(who), { meetingId: m.id }).ok).toBe(false);
      expect(commands.recordAttendance(actor(who), m.id, { mem_member: "present" }).ok).toBe(false);
      expect(meetings.saveMeetingMinutes(actor(who), { meetingId: m.id, discussion: "Example discussion text" }).ok).toBe(false);
      expect(meetings.addDecision(actor(who), { meetingId: m.id, text: "Example decision text" }).ok).toBe(false);
    }
    expect(meetings.markMeetingHeld(actor("mem_sec"), { meetingId: m.id }).ok).toBe(true);
    expect(commands.recordAttendance(actor("mem_sec"), m.id, { mem_member: "present" }).ok).toBe(true);
  });
});

describe("a meeting that has started", () => {
  it("can no longer be changed; cancelling it records that it was not held", () => {
    const base = { title: "Example started meeting", startsAt: "2031-07-01T18:00", location: "Example hall", agenda: "", scope: "chapter:ch_a1", audience: "all" };
    meetings.scheduleMeeting(actor("mem_sec"), base);
    const future = db().meetings.at(-1)!;
    meetings.scheduleMeeting(actor("mem_sec"), { ...base, title: "Example past meeting" });
    const past = db().meetings.at(-1)!;
    past.startsAt = "2020-01-01T10:00:00.000Z";
    expect(meetings.updateMeeting(actor("mem_sec"), { meetingId: past.id, ...base, startsAt: "2031-08-01T18:00" }).ok).toBe(false);
    expect(getMeeting(actor("mem_sec"), past.id)!.canEdit).toBe(true); // can still mark held or not held
    expect(meetings.cancelMeeting(actor("mem_sec"), { meetingId: past.id, reason: "Nobody could attend" }).ok).toBe(true);
    expect(past).toMatchObject({ status: "cancelled", notHeld: true });
    expect(meetings.cancelMeeting(actor("mem_sec"), { meetingId: future.id, reason: "Clashes with the funeral" }).ok).toBe(true);
    expect(future.notHeld).toBeUndefined();
  });
});
