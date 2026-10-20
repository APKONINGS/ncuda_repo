import { writeFileSync } from "node:fs";
import { it } from "vitest";
import members from "../scripts/stakeholder-members.json";
import { buildActor } from "@/lib/auth/actor";
import type { Contribution, Scope } from "@/lib/domain/types";
import { createCleanStart } from "@/lib/demo/fixtures";
import { nextReference } from "@/lib/demo/store";
import { recordAudit } from "@/lib/portal/audit";
import { sendReceipt } from "@/lib/portal/receipts";
import { formatMoney } from "@/lib/utils";

/*
 * Builds the stakeholder demo (lib/demo/stakeholder-seed.json) from
 * scripts/stakeholder-members.json — the member list the user provided. Runs only
 * when asked:   BUILD_STAKEHOLDER_SEED=1 npx vitest run tests/build-stakeholder-seed.test.ts
 *
 * Everyone is in their chapter, holds their post, and has paid their chapter's
 * registration fee (recorded by the chapter's Financial Secretary, with a
 * receipt). Nothing else: projects, meetings and so on are created live.
 * Diaspora has no Regional Coordinator yet (appointed live).
 */

type Row = { sn: number; region: string; chapter: string; name: string; email: string; phone: string; post: string };

const REGION_IDS: Record<string, string> = { "South West": "reg_south_west", "North West": "reg_north_west", Diaspora: "reg_diaspora" };
const CHAPTERS: Record<string, { id: string; code: string; location: string; fee: number }> = {
  Buea: { id: "ch_buea", code: "BUE", location: "Buea", fee: 5000 },
  Bomaka: { id: "ch_bomaka", code: "BOM", location: "Bomaka", fee: 5000 },
  Bamenda: { id: "ch_bamenda", code: "BDA", location: "Bamenda", fee: 5000 },
  Ngwo: { id: "ch_ngwo", code: "NGW", location: "Ngwo", fee: 5000 },
  USA: { id: "ch_usa", code: "USA", location: "United States", fee: 25000 },
  EU: { id: "ch_eu", code: "EU", location: "Europe", fee: 25000 },
};
const ROLE_KEYS: Record<string, string> = {
  "President General": "PRESIDENT_GENERAL",
  "Vice President General": "VICE_PRESIDENT_GENERAL",
  "National Secretary General": "SECRETARY_GENERAL",
  "National Financial Secretary": "CENTRAL_FINANCIAL_SECRETARY",
  "Central Treasurer": "CENTRAL_TREASURER",
  "Regional Coordinator": "REGIONAL_COORDINATOR",
  "Chapter President": "CHAPTER_PRESIDENT",
  "Chapter Secretary": "CHAPTER_SECRETARY",
  "Financial Secretary": "FINANCIAL_SECRETARY",
  Treasurer: "TREASURER",
};

/** Cameroon numbers get their country code; others are kept as given. */
const phoneOf = (p: string) => (/^\d{9}$/.test(p) ? `+237 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p);

it.runIf(process.env.BUILD_STAKEHOLDER_SEED === "1")("builds the stakeholder demo", () => {
  const d = createCleanStart();
  (globalThis as unknown as { __ncudaDemoDB?: unknown }).__ncudaDemoDB = d;
  const rows = members as Row[];

  d.regions = Object.entries(REGION_IDS).map(([name, id]) => ({ id, name }));
  d.chapters = Object.entries(CHAPTERS).map(([name, c]) => {
    const region = rows.find((r) => r.chapter === name)!.region;
    return { id: c.id, name, regionId: REGION_IDS[region], location: c.location, registrationFee: c.fee };
  });

  // Members: the President General keeps the clean start's account id (mem_pg).
  const idOf = (r: Row) => (r.post === "President General" ? "mem_pg" : `mem_${CHAPTERS[r.chapter].code.toLowerCase()}_${r.name.split(" ").pop()}`);
  const pg = "mem_pg";
  d.members = rows.map((r) => {
    const n = r.name.split(" ").pop()!;
    return {
      id: idOf(r),
      fullName: r.name,
      email: r.email,
      phone: phoneOf(r.phone),
      memberNumber: `NCUDA-${CHAPTERS[r.chapter].code}-${n.padStart(3, "0")}`,
      status: "active" as const,
      joinedAt: "2026-10-03T09:00:00.000Z",
      createdBy: pg,
      createdAt: "2026-10-03T09:00:00.000Z",
    };
  });
  d.affiliations = rows.map((r) => ({ id: `aff_${idOf(r)}`, memberId: idOf(r), chapterId: CHAPTERS[r.chapter].id, startedAt: "2026-10-03T09:00:00.000Z", endedAt: null, recordedBy: pg }));

  // Posts: national and regional posts appointed by the President General; chapter Presidents and
  // Financial Secretaries with their chapter; Secretaries and Treasurers by their Chapter President.
  const chapterPresident = (chapter: string) => idOf(rows.find((r) => r.chapter === chapter && r.post === "Chapter President")!);
  d.assignments = rows
    .filter((r) => ROLE_KEYS[r.post])
    .map((r) => {
      const roleKey = ROLE_KEYS[r.post];
      const chapter = CHAPTERS[r.chapter];
      const scope: Scope =
        ["PRESIDENT_GENERAL", "VICE_PRESIDENT_GENERAL", "SECRETARY_GENERAL", "CENTRAL_FINANCIAL_SECRETARY", "CENTRAL_TREASURER"].includes(roleKey)
          ? { level: "organization" }
          : roleKey === "REGIONAL_COORDINATOR"
            ? { level: "region", regionId: REGION_IDS[r.region] }
            : { level: "chapter", chapterId: chapter.id };
      const byPresident = roleKey === "CHAPTER_SECRETARY" || roleKey === "TREASURER";
      return {
        id: roleKey === "PRESIDENT_GENERAL" ? d.assignments.find((a) => a.memberId === pg)!.id : `ra_${idOf(r)}`,
        memberId: idOf(r),
        roleKey,
        scope,
        status: "active" as const,
        assignedBy: roleKey === "PRESIDENT_GENERAL" ? null : byPresident ? chapterPresident(r.chapter) : pg,
        assignedAt: roleKey === "PRESIDENT_GENERAL" ? "2026-10-01T09:00:00.000Z" : byPresident ? "2026-10-02T12:00:00.000Z" : "2026-10-02T09:00:00.000Z",
        endedAt: null,
        endedBy: null,
      };
    });

  // One-click demo sign-in for every member (shared demo password: no personal password set).
  d.accounts = rows.map((r) => ({ email: r.email, memberId: idOf(r), label: r.post }));
  d.credentials = [];

  // Registration: everyone has paid their chapter's fee, recorded by its Financial Secretary, with a receipt.
  const day = (i: number) => `2026-10-${String(6 + (i % 9)).padStart(2, "0")}`;
  rows.forEach((r, i) => {
    const chapter = CHAPTERS[r.chapter];
    const fs = idOf(rows.find((x) => x.chapter === r.chapter && x.post === "Financial Secretary")!);
    const reference = nextReference("RC", 2026);
    const c: Contribution = {
      id: `ct_reg_${idOf(r)}`,
      ledger: "chapter",
      memberId: idOf(r),
      chapterId: chapter.id,
      type: "contribution",
      registrationFee: { year: 2026 },
      description: "Registration fee 2026",
      expectedAmount: chapter.fee,
      amount: chapter.fee,
      currency: "XAF",
      receivedOn: `${day(i)}T12:00:00Z`,
      reference,
      status: "recorded",
      recordedBy: fs,
      recordedAt: `${day(i)}T15:00:00.000Z`,
    };
    d.contributions.push(c);
    sendReceipt(c);
    const recorder = buildActor(fs)!;
    recordAudit(recorder, {
      action: "CREATE",
      entityType: "contribution",
      entityId: c.id,
      chapterId: chapter.id,
      summary: `Recorded registration 2026 of ${formatMoney(chapter.fee)} from ${r.name} — ${reference}`,
      newValues: { registrationYear: 2026, amount: chapter.fee, reference },
    });
  });
  // The receipts and audit entries are dated when they were recorded.
  for (const n of d.notifications) {
    const c = d.contributions.find((x) => n.body.includes(x.reference));
    if (c) n.createdAt = c.recordedAt;
  }
  for (const a of d.audit) {
    const c = d.contributions.find((x) => x.id === a.entityId);
    if (c) a.at = c.recordedAt;
  }

  writeFileSync("lib/demo/stakeholder-seed.json", JSON.stringify(d));
});
