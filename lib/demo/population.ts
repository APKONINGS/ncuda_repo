/**
 * DEMO DATA — a fuller, entirely fictional organisation for visualising the
 * portal: the President General's central EXCO, two regions with their
 * coordinators, a chapter outside any region, a complete EXCO in every
 * chapter, ordinary members, months of contributions towards projects
 * (always in full; some not yet), a few fines, and spending at every level. Deterministic: the same data on every restart.
 */
import type { Chapter, ChapterAffiliation, Collection, Contribution, Expense, Member, RoleAssignment } from "@/lib/domain/types";

type Parts = {
  chapters: Chapter[];
  members: Member[];
  affiliations: ChapterAffiliation[];
  assignments: RoleAssignment[];
  contributions: Contribution[];
  collections: Collection[];
  expenses: Expense[];
};

/** Small deterministic pseudo-random generator (no Math.random: stable demos). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 10)).toISOString();

export function populate(p: Parts) {
  const rand = rng(20261008);

  // ── Structure ────────────────────────────────────────────────────────
  p.chapters.push({ id: "ch_b2", name: "Sample Chapter B2", regionId: "reg_b", location: "Sample town B2" });

  // Existing chapter presidents get clearer demo names.
  const rename = (id: string, name: string) => {
    const m = p.members.find((x) => x.id === id);
    if (m) m.fullName = name;
  };
  rename("mem_s06", "Demo President B1");
  rename("mem_s08", "Demo President (Diaspora)");

  let n = 0;
  const addMember = (id: string, fullName: string, chapterId: string, joined: string, createdBy: string) => {
    n += 1;
    p.members.push({
      id,
      fullName,
      email: `${id.replace("mem_", "").replace(/_/g, ".")}@demo.ncuda.invalid`,
      memberNumber: `DEMO-${chapterId.replace("ch_", "").toUpperCase()}-${String(200 + n)}`,
      status: "active",
      joinedAt: joined,
      createdBy,
      createdAt: joined,
    });
    p.affiliations.push({ id: `aff_p${n}`, memberId: id, chapterId, startedAt: joined, endedAt: null, recordedBy: createdBy });
  };
  let r = 0;
  const appoint = (memberId: string, roleKey: string, scope: RoleAssignment["scope"], by: string | null, at: string) => {
    r += 1;
    p.assignments.push({ id: `ra_p${r}`, memberId, roleKey, scope, status: "active", assignedBy: by, assignedAt: at, endedAt: null, endedBy: null });
  };
  const ORG = { level: "organization" } as const;
  const chapter = (chapterId: string) => ({ level: "chapter", chapterId }) as const;

  // ── The President General's central EXCO (the supreme body) ──────────
  addMember("mem_vpg", "Demo Vice President General", "ch_a2", iso(2016, 3, 12), "mem_pg");
  addMember("mem_secgen", "Demo National Secretary General", "ch_b1", iso(2017, 6, 2), "mem_pg");
  addMember("mem_cfs", "Demo National Financial Secretary", "ch_a1", iso(2018, 1, 20), "mem_pg");
  addMember("mem_ctreas", "Demo Central Treasurer", "ch_d", iso(2016, 11, 5), "mem_pg");
  appoint("mem_vpg", "VICE_PRESIDENT_GENERAL", ORG, "mem_pg", iso(2025, 1, 20));
  appoint("mem_secgen", "SECRETARY_GENERAL", ORG, "mem_pg", iso(2025, 1, 20));
  appoint("mem_cfs", "CENTRAL_FINANCIAL_SECRETARY", ORG, "mem_pg", iso(2025, 1, 20));
  appoint("mem_ctreas", "CENTRAL_TREASURER", ORG, "mem_pg", iso(2025, 1, 20));

  // ── Region B gets its own coordinator ────────────────────────────────
  addMember("mem_coord_b", "Demo Regional Coordinator B", "ch_b2", iso(2019, 4, 14), "mem_pg");
  appoint("mem_coord_b", "REGIONAL_COORDINATOR", { level: "region", regionId: "reg_b" }, "mem_pg", iso(2025, 2, 3));

  // ── A full EXCO and ordinary members in every chapter ────────────────
  type Spec = { chapterId: string; code: string; createdBy: string; officers: Array<[roleKey: string, id: string, name: string]>; members: number };
  const specs: Spec[] = [
    {
      chapterId: "ch_a1",
      code: "A1",
      createdBy: "mem_cpres",
      officers: [["CHAPTER_VICE_PRESIDENT", "mem_a1_vp", "Demo Vice President A1"]],
      members: 3,
    },
    {
      chapterId: "ch_a2",
      code: "A2",
      createdBy: "mem_coord",
      officers: [
        ["CHAPTER_PRESIDENT", "mem_a2_pres", "Demo President A2"],
        ["CHAPTER_VICE_PRESIDENT", "mem_a2_vp", "Demo Vice President A2"],
        ["CHAPTER_SECRETARY", "mem_a2_sec", "Demo Secretary A2"],
        ["FINANCIAL_SECRETARY", "mem_a2_fs", "Demo Financial Secretary A2"],
        ["TREASURER", "mem_a2_treas", "Demo Treasurer A2"],
      ],
      members: 4,
    },
    {
      chapterId: "ch_b1",
      code: "B1",
      createdBy: "mem_s06",
      officers: [
        ["CHAPTER_VICE_PRESIDENT", "mem_b1_vp", "Demo Vice President B1"],
        ["CHAPTER_SECRETARY", "mem_b1_sec", "Demo Secretary B1"],
        ["TREASURER", "mem_b1_treas", "Demo Treasurer B1"],
      ],
      members: 4,
    },
    {
      chapterId: "ch_b2",
      code: "B2",
      createdBy: "mem_coord_b",
      officers: [
        ["CHAPTER_PRESIDENT", "mem_b2_pres", "Demo President B2"],
        ["CHAPTER_VICE_PRESIDENT", "mem_b2_vp", "Demo Vice President B2"],
        ["CHAPTER_SECRETARY", "mem_b2_sec", "Demo Secretary B2"],
        ["FINANCIAL_SECRETARY", "mem_b2_fs", "Demo Financial Secretary B2"],
        ["TREASURER", "mem_b2_treas", "Demo Treasurer B2"],
      ],
      members: 5,
    },
    {
      chapterId: "ch_d",
      code: "D",
      createdBy: "mem_s08",
      officers: [
        ["CHAPTER_VICE_PRESIDENT", "mem_d_vp", "Demo Vice President (Diaspora)"],
        ["CHAPTER_SECRETARY", "mem_d_sec", "Demo Secretary (Diaspora)"],
        ["FINANCIAL_SECRETARY", "mem_d_fs", "Demo Financial Secretary (Diaspora)"],
        ["TREASURER", "mem_d_treas", "Demo Treasurer (Diaspora)"],
      ],
      members: 4,
    },
  ];

  for (const spec of specs) {
    for (const [roleKey, id, name] of spec.officers) {
      addMember(id, name, spec.chapterId, iso(2018 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)), spec.createdBy);
      // Founding presidents were appointed when the chapter was created; other offices by the chapter president.
      const by = roleKey === "CHAPTER_PRESIDENT" ? (spec.chapterId.startsWith("ch_b") ? "mem_coord_b" : "mem_coord") : spec.createdBy;
      appoint(id, roleKey, chapter(spec.chapterId), by, iso(2025, 3, 1 + Math.floor(rand() * 20)));
    }
    for (let i = 1; i <= spec.members; i++) {
      const id = `mem_${spec.code.toLowerCase()}_m${i}`;
      addMember(id, `Sample Member ${spec.code}-${String(i).padStart(2, "0")}`, spec.chapterId, iso(2019 + Math.floor(rand() * 7), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)), spec.createdBy);
    }
  }

  // ── Projects (collections), with what each executive / member is expected to pay ──
  p.collections.push(
    {
      id: "col_dues",
      name: "Annual dues 2026 (example)",
      description: "Example: yearly membership dues for 2026.",
      scope: ORG,
      expected: { executive: 20000, member: 12000 },
      startsOn: iso(2026, 1, 1),
      endsOn: iso(2026, 12, 31),
      createdBy: "mem_cfs",
      createdAt: iso(2025, 12, 15),
    },
    {
      id: "col_tractor",
      name: "Tractor purchase (example project)",
      description: "Example organisation-wide project, raised chapter by chapter, to buy a tractor for community work.",
      scope: ORG,
      expected: { executive: 25000, member: 10000 },
      startsOn: iso(2026, 5, 1),
      endsOn: iso(2026, 12, 31),
      createdBy: "mem_cfs",
      createdAt: iso(2026, 4, 25),
    },
    {
      id: "col_rega_culture",
      name: "Region A cultural day (example)",
      description: "Example regional project: a cultural day hosted together by the chapters of Region A.",
      scope: { level: "region", regionId: "reg_a" },
      expected: { executive: 10000, member: 3000 },
      startsOn: iso(2026, 8, 1),
      endsOn: iso(2026, 11, 30),
      createdBy: "mem_coord",
      createdAt: iso(2026, 7, 20),
    },
    {
      id: "col_a1_pump",
      name: "Water-pump repair (example)",
      description: "Example chapter project for the repair agreed at the 20 September meeting.",
      scope: chapter("ch_a1"),
      expected: { executive: 10000, member: 5000 },
      startsOn: iso(2026, 9, 20),
      createdBy: "mem_finsec",
      createdAt: iso(2026, 9, 20),
    },
    {
      id: "col_b2_hall",
      name: "Meeting hall roof (example)",
      description: "Example chapter project to repair the roof of the chapter’s meeting place.",
      scope: chapter("ch_b2"),
      expected: { executive: 20000, member: 15000 },
      startsOn: iso(2026, 7, 1),
      createdBy: "mem_b2_fs",
      createdAt: iso(2026, 6, 28),
    },
  );
  const project = (id: string) => p.collections.find((c) => c.id === id)!;
  const executive = (memberId: string) => p.assignments.some((a) => a.memberId === memberId && a.status === "active");
  const rate = (collectionId: string, memberId: string) => {
    const col = project(collectionId);
    return executive(memberId) ? col.expected.executive : col.expected.member;
  };

  // ── Contributions ────────────────────────────────────────────────────
  const recorder: Record<string, string> = { ch_a1: "mem_finsec", ch_a2: "mem_a2_fs", ch_b1: "mem_finsec_b", ch_b2: "mem_b2_fs", ch_d: "mem_d_fs" };
  let k = 0;
  const add = (memberId: string, chapterId: string, collectionId: string, amount: number, on: string) => {
    k += 1;
    p.contributions.push({
      id: `ct_p${k}`,
      ledger: "chapter",
      memberId,
      chapterId,
      type: "contribution",
      description: "",
      amount,
      currency: "XAF",
      receivedOn: on,
      reference: "",
      status: "recorded",
      recordedBy: recorder[chapterId],
      recordedAt: on,
      collectionId,
    });
  };
  /** Most people have paid (always in full); some have not paid yet. */
  const payment = (collectionId: string, memberId: string, chance: number) => (rand() >= chance ? 0 : rate(collectionId, memberId));

  const current = (chapterId: string) =>
    p.affiliations.filter((a) => a.chapterId === chapterId && a.endedAt === null).map((a) => a.memberId).filter((id) => p.members.find((m) => m.id === id)?.status === "active");

  // ── The central ledger (kept by the National Financial Secretary) ─────
  let q = 0;
  const central = (memberId: string, chapterId: string, type: Contribution["type"], description: string, amount: number, on: string, extra: Partial<Contribution> = {}) => {
    q += 1;
    p.contributions.push({
      id: `ct_c${q}`,
      ledger: "central",
      memberId,
      chapterId,
      type,
      description,
      amount,
      currency: "XAF",
      receivedOn: on,
      reference: "",
      status: "recorded",
      recordedBy: "mem_cfs",
      recordedAt: on,
      ...extra,
    });
  };
  const homeOf = (memberId: string) => p.affiliations.find((a) => a.memberId === memberId && a.endedAt === null)!.chapterId;
  // The central EXCO pay their dues and tractor share to the centre directly.
  for (const id of ["mem_vpg", "mem_secgen", "mem_cfs", "mem_ctreas"]) {
    central(id, homeOf(id), "contribution", "", rate("col_dues", id), iso(2026, 2, 3 + Math.floor(rand() * 20)), { collectionId: "col_dues" });
  }
  for (const id of ["mem_pg", "mem_ctreas", "mem_vpg"]) {
    central(id, homeOf(id), "contribution", "", rate("col_tractor", id), iso(2026, 6 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 27)), { collectionId: "col_tractor" });
  }
  central("mem_secgen", homeOf("mem_secgen"), "fine", "Late submission of the central EXCO report (example)", 2500, iso(2026, 7, 14), { expectedAmount: 5000 });

  for (const chapterId of Object.keys(recorder)) {
    for (const memberId of current(chapterId)) {
      const paidAlready = (col: string) => p.contributions.some((c) => c.memberId === memberId && c.collectionId === col);
      const day = (from: number, span: number) => iso(2026, from + Math.floor(rand() * span), 1 + Math.floor(rand() * 27));
      if (!paidAlready("col_dues")) {
        const amount = payment("col_dues", memberId, 0.85);
        if (amount) add(memberId, chapterId, "col_dues", amount, day(1, 4));
      }
      if (!paidAlready("col_tractor")) {
        const amount = payment("col_tractor", memberId, 0.7);
        if (amount) add(memberId, chapterId, "col_tractor", amount, day(5, 5));
      }
      if ((chapterId === "ch_a1" || chapterId === "ch_a2") && !paidAlready("col_rega_culture")) {
        const amount = payment("col_rega_culture", memberId, 0.6);
        if (amount) add(memberId, chapterId, "col_rega_culture", amount, day(8, 2));
      }
      if (chapterId === "ch_b2") {
        const amount = payment("col_b2_hall", memberId, 0.8);
        if (amount) add(memberId, chapterId, "col_b2_hall", amount, day(7, 3));
      }
    }
  }

  // A fine paid in full in B2.
  k += 1;
  p.contributions.push({
    id: `ct_p${k}`,
    ledger: "chapter",
    memberId: "mem_b2_m1",
    chapterId: "ch_b2",
    type: "fine",
    description: "Disrupting the 6 September meeting (example)",
    expectedAmount: 2000,
    amount: 2000,
    currency: "XAF",
    receivedOn: iso(2026, 9, 6),
    reference: "",
    status: "recorded",
    recordedBy: "mem_b2_fs",
    recordedAt: iso(2026, 9, 6),
  });

  // ── Expenses (money out) ─────────────────────────────────────────────
  let e = 0;
  const spend = (scope: Expense["scope"], description: string, amount: number, on: string, by: string, paidTo?: string, extra: Partial<Expense> = {}) => {
    e += 1;
    p.expenses.push({ id: `ex_${e}`, scope, description, paidTo, amount, currency: "XAF", spentOn: on, reference: "", status: "recorded", recordedBy: by, recordedAt: on, ...extra });
  };
  spend(ORG, "Transport for the central EXCO’s visit to Region B (example)", 60000, iso(2026, 8, 22), "mem_cfs", "Transport agency (example)");
  spend({ level: "region", regionId: "reg_a" }, "Hall hire for the Region A cultural day (example)", 40000, iso(2026, 9, 12), "mem_coord", "Community hall (example)");
  spend(chapter("ch_a1"), "Refreshments for the 20 September general meeting (example)", 18000, iso(2026, 9, 20), "mem_finsec", "Local caterer (example)");
  spend(chapter("ch_a1"), "Refreshments for the 20 September general meeting (example)", 18000, iso(2026, 9, 20), "mem_finsec", "Local caterer (example)", {
    status: "voided",
    voidedBy: "mem_finsec",
    voidedAt: iso(2026, 9, 21),
    voidReason: "Duplicate entry — recorded twice (example).",
  });
  spend(chapter("ch_b2"), "Roofing sheets for the meeting hall (example)", 150000, iso(2026, 9, 5), "mem_b2_fs", "Hardware supplier (example)");
  spend(chapter("ch_d"), "Venue for the diaspora chapter’s summer meeting (example)", 45000, iso(2026, 7, 18), "mem_d_fs");

  // ── Registration: every chapter has its fee, and everyone in a chapter has paid it ──
  const year = new Date().getFullYear();
  for (const ch of p.chapters) ch.registrationFee ??= ch.regionId ? 5000 : 3000;
  let reg = 0;
  for (const m of p.members.filter((x) => x.status === "active")) {
    const chapterId = p.affiliations.find((a) => a.memberId === m.id && a.endedAt === null)?.chapterId;
    if (!chapterId) continue;
    const fee = p.chapters.find((c) => c.id === chapterId)!.registrationFee!;
    const on = iso(year, 1, 5 + (reg % 20));
    reg += 1;
    p.contributions.push({
      id: `ct_r${reg}`,
      ledger: "chapter",
      memberId: m.id,
      chapterId,
      type: "contribution",
      registrationFee: { year },
      description: `Registration fee ${year}`,
      expectedAmount: fee,
      amount: fee,
      currency: "XAF",
      receivedOn: on,
      reference: "",
      status: "recorded",
      recordedBy: recorder[chapterId] ?? m.id,
      recordedAt: on,
    });
  }

  // ── Finishing touches: project details and automatic receipt numbers ──
  for (const c of p.contributions) {
    if (c.type === "contribution" && c.collectionId && c.memberId) {
      c.description = project(c.collectionId).description;
      c.expectedAmount = rate(c.collectionId, c.memberId);
      c.amount = c.expectedAmount; // no partial payments: always the full amount
    }
    // A fine is either unpaid (imposed, to be paid later) or paid in full.
    if (c.type === "fine" && c.expectedAmount && c.amount > 0) c.amount = c.expectedAmount;
  }
  const number = <T extends { recordedAt: string; reference: string }>(rows: T[], kind: "RC" | "PV") => {
    const counters: Record<string, number> = {};
    for (const row of [...rows].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
      const year = row.recordedAt.slice(0, 4);
      counters[year] = (counters[year] ?? 0) + 1;
      row.reference = `${kind}-${year}-${String(counters[year]).padStart(5, "0")}`;
    }
  };
  number(p.contributions, "RC");
  number(p.expenses, "PV");
}
