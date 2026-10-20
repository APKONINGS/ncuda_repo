import { beforeEach, describe, expect, it } from "vitest";
import seed from "@/lib/demo/stakeholder-seed.json";
import members from "../scripts/stakeholder-members.json";
import { buildActor } from "@/lib/auth/actor";
import { passwordStatus, verifyDemoCredentials } from "@/lib/auth/demo-credentials";
import { DEMO_PASSWORD } from "@/lib/demo/fixtures";
import { db } from "@/lib/demo/store";
import { financialSummary, listNotifications, registrationDesk } from "@/lib/portal/queries";

/* The prepared stakeholder demo (lib/demo/stakeholder-seed.json), checked the way the portal sees it. */
beforeEach(() => {
  (globalThis as unknown as { __ncudaDemoDB?: unknown }).__ncudaDemoDB = structuredClone(seed);
});

describe("stakeholder demo", () => {
  it("has the 60 members of the list in their 6 chapters and 3 regions", () => {
    expect(db().members).toHaveLength(60);
    expect(db().chapters.map((c) => c.name).sort()).toEqual(["Bamenda", "Bomaka", "Buea", "EU", "Ngwo", "USA"]);
    expect(db().regions.map((r) => r.name).sort()).toEqual(["Diaspora", "North West", "South West"]);
    for (const r of members) expect(db().members.some((m) => m.email === r.email && m.fullName === r.name)).toBe(true);
  });

  it("everyone signs in with one click (shared demo password), is in their chapter and is active", () => {
    expect(db().accounts).toHaveLength(60);
    for (const a of db().accounts) {
      expect(passwordStatus(a.memberId)).toBe("shared");
      expect(verifyDemoCredentials(a.email, DEMO_PASSWORD)).toBe(a.memberId);
      const actor = buildActor(a.memberId)!;
      expect(actor.chapterId).not.toBeNull();
      expect(actor.inactive).toBeNull(); // registration paid
      expect(actor.mustJoinChapter).toBe(false);
    }
  });

  it("each post has one holder and each person one post, as listed; Diaspora has no coordinator yet", () => {
    const active = db().assignments.filter((a) => a.status === "active");
    const posts = active.map((a) => `${a.roleKey}|${JSON.stringify(a.scope)}`);
    expect(new Set(posts).size).toBe(posts.length);
    expect(new Set(active.map((a) => a.memberId)).size).toBe(active.length);
    expect(active).toHaveLength((members as Array<{ post: string }>).filter((r) => r.post !== "Member").length);
    expect(active.some((a) => a.roleKey === "REGIONAL_COORDINATOR" && a.scope.level === "region" && a.scope.regionId === "reg_diaspora")).toBe(false);
    expect(buildActor("mem_pg")!.roles.map((r) => r.role.key)).toEqual(["PRESIDENT_GENERAL"]);
  });

  it("every registration fee is recorded by the chapter's Financial Secretary, with a receipt in the member's notifications", () => {
    expect(db().contributions).toHaveLength(60);
    for (const c of db().contributions) {
      expect(c.registrationFee?.year).toBe(2026);
      expect(c.amount).toBe(["ch_usa", "ch_eu"].includes(c.chapterId) ? 25000 : 5000);
      const fs = db().assignments.find((a) => a.roleKey === "FINANCIAL_SECRETARY" && a.scope.level === "chapter" && a.scope.chapterId === c.chapterId)!;
      expect(c.recordedBy).toBe(fs.memberId);
      expect(listNotifications(buildActor(c.memberId)!).some((n) => n.title === `Receipt ${c.reference} · Registration 2026`)).toBe(true);
    }
    // The Buea Financial Secretary's desk shows all 10 paid; the National Summary shows the money.
    const buea = registrationDesk(buildActor("mem_bue_5")!)!.chapters[0];
    expect(buea.paid).toHaveLength(10);
    const summary = financialSummary(buildActor("mem_pg")!)!;
    expect(summary.find((s) => s.name === "USA")?.income).toBe(250000);
    expect(summary.find((s) => s.name === "Buea")?.income).toBe(50000);
  });
});
