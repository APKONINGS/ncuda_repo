/**
 * DEMO DATA — entirely fictional.
 *
 * Every person, chapter, region, meeting, amount and document below is
 * invented for demonstration. Names are deliberately labelled "Demo …",
 * "Sample …" or "Example …" so they can never be mistaken for real NCUDA
 * records. Replace with Supabase data (see docs/ARCHITECTURE.md).
 */
import type {
  ActionItem,
  AttendanceRecord,
  AttendanceStatus,
  AuditEntry,
  AuthorityDelegation,
  Chapter,
  ChapterAffiliation,
  Collection,
  Committee,
  CommitteeMeeting,
  CommitteeMembership,
  Contribution,
  Decision,
  DocumentRecord,
  Expense,
  Meeting,
  MeetingMinutes,
  Member,
  NotificationRecord,
  Organization,
  Region,
  RegistrationRenewal,
  RoleAssignment,
} from "@/lib/domain/types";
import { populate } from "./population";

export interface DemoDB {
  organization: Organization;
  regions: Region[];
  chapters: Chapter[];
  members: Member[];
  affiliations: ChapterAffiliation[];
  assignments: RoleAssignment[];
  delegations: AuthorityDelegation[];
  meetings: Meeting[];
  attendance: AttendanceRecord[];
  minutes: MeetingMinutes[];
  decisions: Decision[];
  actionItems: ActionItem[];
  contributions: Contribution[];
  collections: Collection[];
  expenses: Expense[];
  documents: DocumentRecord[];
  notifications: NotificationRecord[];
  notificationReads: Array<{ notificationId: string; memberId: string; readAt: string }>;
  audit: AuditEntry[];
  /** Demo sign-in accounts (email → member). Password is shared and shown on the login page. */
  accounts: Array<{ email: string; memberId: string; label: string }>;
  /**
   * Personal passwords (salted scrypt hashes), kept apart from member records
   * so they never travel with member data. Members without one sign in with
   * the shared demo password. Optional: older saved data has none.
   */
  credentials?: DemoCredential[];
  /** Yearly registration renewals, newest last. Optional: older saved data has none. */
  renewals?: RegistrationRenewal[];
  /** Committees and their members. Optional: older saved data has none. */
  committees?: Committee[];
  committeeMembers?: CommitteeMembership[];
  committeeMeetings?: CommitteeMeeting[];
  seq: number;
}

export const DEMO_PASSWORD = "ncuda-demo";

export interface DemoCredential {
  memberId: string;
  salt: string;
  hash: string;
  /** Set by someone else (e.g. when the account was created) — the member should change it. */
  temporary: boolean;
  setBy: string | null;
  updatedAt: string;
}

export function createFixtures(): DemoDB {
  const organization: Organization = { id: "org_ncuda", name: "NCUDA" };

  const regions: Region[] = [
    { id: "reg_a", name: "Sample Region A" },
    { id: "reg_b", name: "Sample Region B" },
  ];

  const chapters: Chapter[] = [
    { id: "ch_a1", name: "Sample Chapter A1", regionId: "reg_a", location: "Sample town A1" },
    { id: "ch_a2", name: "Sample Chapter A2", regionId: "reg_a", location: "Sample town A2" },
    { id: "ch_b1", name: "Sample Chapter B1", regionId: "reg_b", location: "Sample town B1" },
    // A chapter that reports directly to the organisation — no region.
    { id: "ch_d", name: "Sample Diaspora Chapter", regionId: null, location: "Abroad (sample)" },
  ];

  const m = (
    id: string,
    fullName: string,
    n: string,
    joinedAt: string,
    extra: Partial<Member> = {},
  ): Member => ({
    id,
    fullName,
    email: `${id.replace("mem_", "")}@demo.ncuda.invalid`,
    memberNumber: `DEMO-${n}`,
    status: "active",
    joinedAt,
    createdBy: "mem_coord",
    createdAt: joinedAt,
    ...extra,
  });

  const members: Member[] = [
    m("mem_member", "Demo Member", "A1-014", "2024-03-02T10:00:00Z", { phone: "+000 000 0000 (demo)" }),
    m("mem_cpres", "Demo Chapter President", "A1-003", "2019-05-11T10:00:00Z"),
    m("mem_finsec", "Demo Financial Secretary", "A1-021", "2021-02-06T10:00:00Z"),
    m("mem_sec", "Demo Chapter Secretary", "A1-008", "2020-07-18T10:00:00Z"),
    m("mem_treas", "Demo Treasurer", "A1-011", "2020-09-12T10:00:00Z"),
    m("mem_coord", "Demo Regional Coordinator", "A2-002", "2018-01-20T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_pg", "Demo President General", "D-001", "2015-06-01T10:00:00Z", { createdBy: null }),
    m("mem_finsec_b", "Demo Financial Secretary (B1)", "B1-005", "2022-04-02T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_s01", "Sample Member 01", "A1-030", "2025-01-11T10:00:00Z"),
    m("mem_s02", "Sample Member 02", "A1-017", "2021-11-20T10:00:00Z"),
    m("mem_s03", "Sample Member 03", "A1-041", "2024-01-10T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_s04", "Sample Member 04", "A2-019", "2023-08-05T10:00:00Z"),
    m("mem_s05", "Sample Member 05", "A2-020", "2023-08-05T10:00:00Z"),
    m("mem_s06", "Sample Member 06", "B1-001", "2017-03-03T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_s07", "Sample Member 07", "B1-012", "2022-10-29T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_s08", "Sample Member 08", "D-007", "2020-02-14T10:00:00Z", { createdBy: "mem_pg" }),
    m("mem_s09", "Sample Member 09", "A1-044", "2025-09-06T10:00:00Z", {
      status: "suspended",
      statusChange: { by: "mem_cpres", at: "2026-09-28T10:00:00Z", reason: "Example reason — suspended pending a chapter review." },
    }),
  ];

  const home: Record<string, string> = {
    mem_member: "ch_a1",
    mem_cpres: "ch_a1",
    mem_finsec: "ch_a1",
    mem_sec: "ch_a1",
    mem_treas: "ch_a1",
    mem_coord: "ch_a2",
    mem_pg: "ch_d",
    mem_finsec_b: "ch_b1",
    mem_s01: "ch_a1",
    mem_s02: "ch_a1",
    mem_s04: "ch_a2",
    mem_s05: "ch_a2",
    mem_s06: "ch_b1",
    mem_s07: "ch_b1",
    mem_s08: "ch_d",
    mem_s09: "ch_a1",
  };

  const affiliations: ChapterAffiliation[] = [
    ...Object.entries(home).map(([memberId, chapterId], i) => ({
      id: `aff_${i + 1}`,
      memberId,
      chapterId,
      startedAt: members.find((x) => x.id === memberId)!.joinedAt,
      endedAt: null,
      recordedBy: "mem_coord",
    })),
    // Sample Member 03 transferred from B1 to A1 — history is preserved.
    {
      id: "aff_90",
      memberId: "mem_s03",
      chapterId: "ch_b1",
      startedAt: "2024-01-10T10:00:00Z",
      endedAt: "2026-06-01T09:00:00Z",
      recordedBy: "mem_pg",
      note: "Transferred on relocation (example)",
    },
    {
      id: "aff_91",
      memberId: "mem_s03",
      chapterId: "ch_a1",
      startedAt: "2026-06-01T09:00:00Z",
      endedAt: null,
      recordedBy: "mem_coord",
    },
  ];

  const ra = (
    id: string,
    memberId: string,
    roleKey: string,
    scope: RoleAssignment["scope"],
    assignedBy: string | null,
    assignedAt: string,
    ended?: { at: string; by: string; reason: string },
  ): RoleAssignment => ({
    id,
    memberId,
    roleKey,
    scope,
    status: ended ? "ended" : "active",
    assignedBy,
    assignedAt,
    endedAt: ended?.at ?? null,
    endedBy: ended?.by ?? null,
    endReason: ended?.reason,
  });

  const A1 = { level: "chapter", chapterId: "ch_a1" } as const;
  const assignments: RoleAssignment[] = [
    ra("ra_1", "mem_pg", "PRESIDENT_GENERAL", { level: "organization" }, null, "2025-01-15T12:00:00Z"),
    ra("ra_2", "mem_coord", "REGIONAL_COORDINATOR", { level: "region", regionId: "reg_a" }, "mem_pg", "2025-02-01T12:00:00Z"),
    ra("ra_3", "mem_cpres", "CHAPTER_PRESIDENT", A1, "mem_coord", "2025-03-01T12:00:00Z"),
    ra("ra_4", "mem_sec", "CHAPTER_SECRETARY", A1, "mem_coord", "2025-03-01T12:00:00Z"),
    ra("ra_5", "mem_s02", "FINANCIAL_SECRETARY", A1, "mem_coord", "2025-03-01T12:00:00Z", {
      at: "2026-03-14T12:00:00Z",
      by: "mem_coord",
      reason: "End of term (example)",
    }),
    ra("ra_6", "mem_finsec", "FINANCIAL_SECRETARY", A1, "mem_coord", "2026-03-14T12:00:00Z"),
    ra("ra_7", "mem_treas", "TREASURER", A1, "mem_coord", "2025-03-01T12:00:00Z"),
    ra("ra_8", "mem_finsec_b", "FINANCIAL_SECRETARY", { level: "chapter", chapterId: "ch_b1" }, "mem_pg", "2025-04-10T12:00:00Z"),
    // Region B has no coordinator: the President General appoints directly.
    ra("ra_9", "mem_s06", "CHAPTER_PRESIDENT", { level: "chapter", chapterId: "ch_b1" }, "mem_pg", "2025-04-10T12:00:00Z"),
    ra("ra_10", "mem_s08", "CHAPTER_PRESIDENT", { level: "chapter", chapterId: "ch_d" }, "mem_pg", "2025-04-12T12:00:00Z"),
  ];

  const delegations: AuthorityDelegation[] = [
    {
      id: "dl_1",
      grantedBy: "mem_pg",
      grantedTo: "mem_coord",
      scope: { level: "region", regionId: "reg_a" },
      permissions: ["VIEW_CONTRIBUTIONS"],
      startsAt: "2026-09-01T00:00:00Z",
      endsAt: "2026-12-31T23:59:59Z",
      status: "active",
      note: "Example: temporary access to review Region A contribution records for the year-end report.",
      createdAt: "2026-09-01T08:00:00Z",
    },
  ];

  const meetings: Meeting[] = [
    {
      id: "mt_1",
      title: "Example Meeting — Chapter A1 monthly meeting",
      startsAt: "2026-10-18T14:00:00Z",
      endsAt: "2026-10-18T17:00:00Z",
      location: "Sample meeting hall, Sample town A1",
      scope: A1,
      status: "scheduled",
      agenda: ["Opening and roll call", "Adoption of the 20 September minutes", "Review of outstanding action items", "Water-pump repair update (example)", "Any other business"],
      createdBy: "mem_sec",
    },
    {
      id: "mt_2",
      title: "Example Meeting — Region A coordination",
      startsAt: "2026-11-08T13:00:00Z",
      location: "Online (sample)",
      scope: { level: "region", regionId: "reg_a" },
      status: "scheduled",
      agenda: ["Chapter reports", "Year-end planning", "Any other business"],
      createdBy: "mem_coord",
    },
    {
      id: "mt_3",
      title: "Example Meeting — General Assembly (sample)",
      startsAt: "2026-12-27T10:00:00Z",
      location: "To be announced",
      scope: { level: "organization" },
      status: "scheduled",
      agenda: ["Address by the President General", "Reports from regions and chapters", "Elections (if due)"],
      createdBy: "mem_pg",
    },
    {
      id: "mt_4",
      title: "Example Meeting — Chapter A1 monthly meeting",
      startsAt: "2026-09-20T14:00:00Z",
      endsAt: "2026-09-20T17:00:00Z",
      location: "Sample meeting hall, Sample town A1",
      scope: A1,
      status: "held",
      agenda: ["Opening and roll call", "Adoption of previous minutes", "Water-pump repair proposal (example)", "Welfare fund discussion (example)"],
      createdBy: "mem_sec",
    },
    {
      id: "mt_5",
      title: "Example Meeting — Chapter A1 monthly meeting",
      startsAt: "2026-08-16T14:00:00Z",
      location: "Sample meeting hall, Sample town A1",
      scope: A1,
      status: "held",
      agenda: ["Opening and roll call", "Cultural gathering planning (example)"],
      createdBy: "mem_sec",
    },
    {
      id: "mt_6",
      title: "Example Meeting — Chapter A1 monthly meeting",
      startsAt: "2026-07-19T14:00:00Z",
      location: "Sample meeting hall, Sample town A1",
      scope: A1,
      status: "held",
      agenda: ["Opening and roll call", "Dues reminder"],
      createdBy: "mem_sec",
    },
    {
      id: "mt_7",
      title: "Example Meeting — Chapter B1 meeting",
      startsAt: "2026-09-13T14:00:00Z",
      location: "Sample venue, Sample town B1",
      scope: { level: "chapter", chapterId: "ch_b1" },
      status: "held",
      agenda: ["Chapter B1 business (example)"],
      createdBy: "mem_s06",
    },
  ];

  const att = (meetingId: string, rows: Array<[string, AttendanceStatus]>, chapterId = "ch_a1", by = "mem_sec"): AttendanceRecord[] =>
    rows.map(([memberId, status], i) => ({
      id: `at_${meetingId}_${i}`,
      meetingId,
      memberId,
      chapterId,
      status,
      recordedBy: by,
      recordedAt: meetings.find((x) => x.id === meetingId)!.startsAt,
    }));

  const attendance: AttendanceRecord[] = [
    ...att("mt_4", [
      ["mem_member", "present"],
      ["mem_cpres", "present"],
      ["mem_finsec", "present"],
      ["mem_sec", "present"],
      ["mem_treas", "late"],
      ["mem_s01", "absent"],
      ["mem_s02", "excused"],
      ["mem_s03", "present"],
    ]),
    ...att("mt_5", [
      ["mem_member", "late"],
      ["mem_cpres", "present"],
      ["mem_finsec", "present"],
      ["mem_sec", "present"],
      ["mem_treas", "present"],
      ["mem_s01", "present"],
      ["mem_s02", "present"],
      ["mem_s03", "absent"],
    ]),
    ...att("mt_6", [
      ["mem_member", "present"],
      ["mem_cpres", "excused"],
      ["mem_finsec", "present"],
      ["mem_sec", "present"],
      ["mem_treas", "present"],
      ["mem_s01", "absent"],
      ["mem_s02", "present"],
    ]),
    ...att("mt_7", [["mem_s06", "present"], ["mem_s07", "present"], ["mem_finsec_b", "late"]], "ch_b1", "mem_s06"),
  ];

  const minutes: MeetingMinutes[] = [
    {
      id: "mn_4",
      meetingId: "mt_4",
      status: "published",
      discussion:
        "Example minutes. The chapter discussed a proposal to repair a community water pump and agreed to gather quotes before committing funds. Members also discussed creating a welfare fund to support families in hardship, and asked the Secretary to prepare a written proposal.",
      keyIssues: ["Condition of the community water pump (example)", "How a welfare fund would be governed (example)"],
      resolutions: ["Collect two independent repair quotes before the next meeting.", "Present a welfare fund proposal at the General Assembly."],
      recordedBy: "mem_sec",
      updatedAt: "2026-09-23T18:00:00Z",
      publishedAt: "2026-09-24T09:00:00Z",
    },
    {
      id: "mn_5",
      meetingId: "mt_5",
      status: "published",
      discussion: "Example minutes. Planning for an end-of-year cultural gathering; volunteers were asked to come forward.",
      keyIssues: ["Venue and date for the cultural gathering (example)"],
      resolutions: ["Hold the end-of-year cultural gathering (example)."],
      recordedBy: "mem_sec",
      updatedAt: "2026-08-18T18:00:00Z",
      publishedAt: "2026-08-19T09:00:00Z",
    },
    {
      id: "mn_6",
      meetingId: "mt_6",
      status: "draft",
      discussion: "Draft minutes (example) — not yet published to members.",
      keyIssues: [],
      resolutions: [],
      recordedBy: "mem_sec",
      updatedAt: "2026-07-21T18:00:00Z",
    },
  ];

  const decisions: Decision[] = [
    { id: "dc_1", meetingId: "mt_4", text: "Example decision: repair the community water pump.", recordedBy: "mem_sec", createdAt: "2026-09-20T16:30:00Z" },
    { id: "dc_2", meetingId: "mt_4", text: "Example decision: prepare a welfare fund proposal for the General Assembly.", recordedBy: "mem_sec", createdAt: "2026-09-20T16:40:00Z" },
    { id: "dc_3", meetingId: "mt_5", text: "Example decision: hold an end-of-year cultural gathering.", recordedBy: "mem_sec", createdAt: "2026-08-16T16:00:00Z" },
  ];

  const actionItems: ActionItem[] = [
    { id: "ai_1", decisionId: "dc_1", meetingId: "mt_4", title: "Obtain two repair quotes for the water pump", assigneeId: "mem_member", dueDate: "2026-10-15T17:00:00Z", status: "pending" },
    { id: "ai_2", decisionId: "dc_1", meetingId: "mt_4", title: "Report funds available for the repair", assigneeId: "mem_finsec", dueDate: "2026-10-18T14:00:00Z", status: "in_progress" },
    { id: "ai_3", decisionId: "dc_2", meetingId: "mt_4", title: "Draft the welfare fund proposal", assigneeId: "mem_sec", dueDate: "2026-11-01T17:00:00Z", status: "pending" },
    { id: "ai_4", decisionId: "dc_3", meetingId: "mt_5", title: "Reserve a venue for the cultural gathering", assigneeId: "mem_cpres", dueDate: "2026-09-10T17:00:00Z", status: "completed", completedAt: "2026-09-02T11:00:00Z", completedBy: "mem_cpres" },
  ];

  let c = 0;
  const contrib = (
    memberId: string,
    chapterId: string,
    type: Contribution["type"],
    description: string,
    amount: number,
    receivedOn: string,
    recordedBy: string,
    extra: Partial<Contribution> = {},
  ): Contribution => ({
    id: `ct_${++c}`,
    ledger: "chapter",
    memberId,
    chapterId,
    type,
    description,
    amount,
    currency: "XAF",
    receivedOn,
    status: "recorded",
    recordedBy,
    recordedAt: receivedOn,
    reference: "", // numbered by populate()
    ...extra,
  });

  // Description and expected amount are filled in from each project by populate().
  const contributions: Contribution[] = [
    contrib("mem_member", "ch_a1", "contribution", "", 12000, "2026-02-14T10:00:00Z", "mem_s02", { collectionId: "col_dues" }),
    contrib("mem_member", "ch_a1", "contribution", "", 5000, "2026-09-21T10:00:00Z", "mem_finsec", {
      collectionId: "col_a1_pump",
      status: "voided",
      voidedBy: "mem_finsec",
      voidedAt: "2026-09-22T09:00:00Z",
      voidReason: "Duplicate entry — recorded twice (example).",
    }),
    contrib("mem_member", "ch_a1", "contribution", "", 5000, "2026-09-21T10:05:00Z", "mem_finsec", { collectionId: "col_a1_pump" }),
    contrib("mem_cpres", "ch_a1", "contribution", "", 20000, "2026-01-30T10:00:00Z", "mem_s02", { collectionId: "col_dues" }),
    contrib("mem_finsec", "ch_a1", "contribution", "", 20000, "2026-02-02T10:00:00Z", "mem_s02", { collectionId: "col_dues" }),
    contrib("mem_sec", "ch_a1", "contribution", "", 20000, "2026-03-20T10:00:00Z", "mem_finsec", { collectionId: "col_dues" }),
    contrib("mem_treas", "ch_a1", "contribution", "", 10000, "2026-04-04T10:00:00Z", "mem_finsec", { collectionId: "col_dues" }),
    contrib("mem_s01", "ch_a1", "contribution", "", 12000, "2026-05-09T10:00:00Z", "mem_finsec", { collectionId: "col_dues" }),
    contrib("mem_s03", "ch_a1", "contribution", "", 5000, "2026-09-27T10:00:00Z", "mem_finsec", { collectionId: "col_a1_pump" }),
    contrib("mem_cpres", "ch_a1", "contribution", "", 10000, "2026-08-30T10:00:00Z", "mem_finsec", { collectionId: "col_rega_culture" }),
    contrib("mem_member", "ch_a1", "contribution", "", 3000, "2026-08-30T10:10:00Z", "mem_finsec", { collectionId: "col_rega_culture" }),
    contrib("mem_member", "ch_a1", "fine", "Late arrival at the 20 September meeting (example)", 0, "2026-09-20T15:30:00Z", "mem_finsec", { expectedAmount: 1000 }),
    contrib("mem_s01", "ch_a1", "fine", "Absent without excuse from the 16 August meeting (example)", 1000, "2026-08-16T16:00:00Z", "mem_finsec", { expectedAmount: 2000 }),
    contrib("mem_s06", "ch_b1", "contribution", "", 20000, "2026-02-20T10:00:00Z", "mem_finsec_b", { collectionId: "col_dues" }),
    contrib("mem_s07", "ch_b1", "contribution", "", 12000, "2026-03-11T10:00:00Z", "mem_finsec_b", { collectionId: "col_dues" }),
    contrib("mem_s04", "ch_a2", "contribution", "", 12000, "2026-02-28T10:00:00Z", "mem_coord", { collectionId: "col_dues" }),
    contrib("mem_s08", "ch_d", "contribution", "", 20000, "2026-01-18T10:00:00Z", "mem_pg", { collectionId: "col_dues" }),
  ];


  const doc = (
    id: string,
    title: string,
    category: DocumentRecord["category"],
    scope: DocumentRecord["scope"],
    uploadedBy: string,
    uploadedAt: string,
    extra: Partial<DocumentRecord> = {},
  ): DocumentRecord => {
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.pdf`;
    return {
      id,
      title,
      filename,
      category,
      scope,
      storagePath: `demo/${id}/${filename}`,
      sizeBytes: 90_000 + id.length * 13_337,
      mimeType: "application/pdf",
      uploadedBy,
      uploadedAt,
      ...extra,
    };
  };

  const documents: DocumentRecord[] = [
    doc("doc_1", "Minutes — Chapter A1, 20 September 2026 (example)", "minutes", A1, "mem_sec", "2026-09-24T09:00:00Z", { meetingId: "mt_4" }),
    doc("doc_2", "Minutes — Chapter A1, 16 August 2026 (example)", "minutes", A1, "mem_sec", "2026-08-19T09:00:00Z", { meetingId: "mt_5" }),
    doc("doc_3", "Association constitution (placeholder file)", "association", { level: "organization" }, "mem_pg", "2026-01-10T09:00:00Z"),
    doc("doc_4", "Chapter A1 financial summary, Q3 2026 (example)", "financial", A1, "mem_finsec", "2026-10-01T09:00:00Z"),
    doc("doc_5", "Membership enrolment form (example)", "forms", { level: "organization" }, "mem_pg", "2026-02-01T09:00:00Z"),
    doc("doc_6", "Region A coordination report (example)", "reports", { level: "region", regionId: "reg_a" }, "mem_coord", "2026-09-30T09:00:00Z"),
    doc("doc_7", "Minutes — Chapter B1, 13 September 2026 (example)", "minutes", { level: "chapter", chapterId: "ch_b1" }, "mem_s06", "2026-09-16T09:00:00Z", { meetingId: "mt_7" }),
  ];

  const notifications: NotificationRecord[] = [
    { id: "nt_1", type: "announcement", title: "Welcome to the NCUDA Member Portal", body: "This is a demonstration of the portal. All people, chapters and records shown are fictional examples.", audience: { kind: "scope", scope: { level: "organization" } }, createdBy: "mem_pg", createdAt: "2026-09-01T08:00:00Z" },
    { id: "nt_2", type: "action_assigned", title: "New action item assigned to you", body: "Obtain two repair quotes for the water pump — due 15 October.", audience: { kind: "member", memberId: "mem_member" }, link: "/dashboard/meetings/mt_4", createdBy: "mem_sec", createdAt: "2026-09-21T09:00:00Z" },
    { id: "nt_3", type: "minutes_published", title: "Minutes published: 20 September meeting", body: "The minutes of the Chapter A1 meeting on 20 September are now available.", audience: { kind: "scope", scope: A1 }, link: "/dashboard/meetings/mt_4", createdBy: "mem_sec", createdAt: "2026-09-24T09:00:00Z" },
    { id: "nt_4", type: "document_uploaded", title: "New document: Region A coordination report", body: "A report has been shared with all chapters in Sample Region A.", audience: { kind: "scope", scope: { level: "region", regionId: "reg_a" } }, link: "/dashboard/public-relations", createdBy: "mem_coord", createdAt: "2026-09-30T09:00:00Z" },
    { id: "nt_5", type: "meeting_reminder", title: "Upcoming: Chapter A1 meeting on 18 October", body: "Your chapter meets on Sunday 18 October at 15:00 (WAT).", audience: { kind: "scope", scope: A1 }, link: "/dashboard/meetings/mt_1", createdBy: "mem_sec", createdAt: "2026-10-02T09:00:00Z" },
    { id: "nt_6", type: "action_due", title: "Action item due soon", body: "“Obtain two repair quotes for the water pump” is due on 15 October.", audience: { kind: "member", memberId: "mem_member" }, link: "/dashboard/meetings/mt_4", createdBy: null, createdAt: "2026-10-03T07:00:00Z" },
    { id: "nt_8", type: "message", title: "To all Chapter Presidents: year-end reports", body: "Example message. Dear Chapter Presidents, please send your chapter's year-end report to the central secretariat before the General Assembly. Thank you for your leadership this year.", audience: { kind: "group", scope: { level: "organization" }, roleKeys: ["CHAPTER_PRESIDENT"] }, createdBy: "mem_pg", createdAt: "2026-10-04T08:00:00Z" },
    { id: "nt_7", type: "announcement", title: "Chapter B1 notice (example)", body: "Visible only to members of Sample Chapter B1.", audience: { kind: "scope", scope: { level: "chapter", chapterId: "ch_b1" } }, createdBy: "mem_s06", createdAt: "2026-09-25T09:00:00Z" },
  ];

  const audit: AuditEntry[] = [
    { id: "au_1", at: "2025-02-01T12:00:00Z", actorId: "mem_pg", actorRoles: ["PRESIDENT_GENERAL"], action: "ASSIGN_ROLE", entityType: "role_assignment", entityId: "ra_2", chapterId: null, regionId: "reg_a", summary: "Assigned Regional Coordinator (Sample Region A) to Demo Regional Coordinator", newValues: { role: "REGIONAL_COORDINATOR", scope: "region:reg_a" } },
    { id: "au_2", at: "2026-03-14T12:00:00Z", actorId: "mem_coord", actorRoles: ["REGIONAL_COORDINATOR"], action: "REMOVE_ROLE", entityType: "role_assignment", entityId: "ra_5", chapterId: "ch_a1", regionId: "reg_a", summary: "Ended Financial Secretary (Sample Chapter A1) for Sample Member 02", oldValues: { status: "active" }, newValues: { status: "ended" }, reason: "End of term (example)" },
    { id: "au_3", at: "2026-03-14T12:01:00Z", actorId: "mem_coord", actorRoles: ["REGIONAL_COORDINATOR"], action: "ASSIGN_ROLE", entityType: "role_assignment", entityId: "ra_6", chapterId: "ch_a1", regionId: "reg_a", summary: "Assigned Financial Secretary (Sample Chapter A1) to Demo Financial Secretary", newValues: { role: "FINANCIAL_SECRETARY", scope: "chapter:ch_a1" } },
    { id: "au_4", at: "2026-06-01T09:00:00Z", actorId: "mem_coord", actorRoles: ["REGIONAL_COORDINATOR"], action: "UPDATE", entityType: "chapter_affiliation", entityId: "aff_91", chapterId: "ch_a1", regionId: "reg_a", summary: "Transferred Sample Member 03 from Sample Chapter B1 to Sample Chapter A1", oldValues: { chapter: "ch_b1" }, newValues: { chapter: "ch_a1" } },
    { id: "au_5", at: "2026-09-01T08:00:00Z", actorId: "mem_pg", actorRoles: ["PRESIDENT_GENERAL"], action: "CREATE", entityType: "authority_delegation", entityId: "dl_1", chapterId: null, regionId: "reg_a", summary: "Delegated VIEW_CONTRIBUTIONS (Sample Region A) to Demo Regional Coordinator until 31 Dec 2026", newValues: { permissions: ["VIEW_CONTRIBUTIONS"], scope: "region:reg_a" } },
    { id: "au_6", at: "2026-09-21T10:00:00Z", actorId: "mem_finsec", actorRoles: ["FINANCIAL_SECRETARY"], action: "CREATE", entityType: "contribution", entityId: "ct_2", chapterId: "ch_a1", regionId: "reg_a", summary: "Recorded contribution of XAF 5,000 from Demo Member (water-pump repair)", newValues: { amount: 5000, type: "contribution" } },
    { id: "au_7", at: "2026-09-21T10:05:00Z", actorId: "mem_finsec", actorRoles: ["FINANCIAL_SECRETARY"], action: "CREATE", entityType: "contribution", entityId: "ct_3", chapterId: "ch_a1", regionId: "reg_a", summary: "Recorded contribution of XAF 5,000 from Demo Member (water-pump repair)", newValues: { amount: 5000, type: "contribution" } },
    { id: "au_8", at: "2026-09-22T09:00:00Z", actorId: "mem_finsec", actorRoles: ["FINANCIAL_SECRETARY"], action: "VOID", entityType: "contribution", entityId: "ct_2", chapterId: "ch_a1", regionId: "reg_a", summary: "Voided duplicate contribution record for Demo Member", oldValues: { status: "recorded" }, newValues: { status: "voided" }, reason: "Duplicate entry — recorded twice (example)." },
    { id: "au_9", at: "2026-09-24T09:00:00Z", actorId: "mem_sec", actorRoles: ["CHAPTER_SECRETARY"], action: "UPDATE", entityType: "meeting_minutes", entityId: "mn_4", chapterId: "ch_a1", regionId: "reg_a", summary: "Published minutes of the 20 September meeting", oldValues: { status: "draft" }, newValues: { status: "published" } },
    { id: "au_10", at: "2026-09-24T09:01:00Z", actorId: "mem_sec", actorRoles: ["CHAPTER_SECRETARY"], action: "UPLOAD", entityType: "document", entityId: "doc_1", chapterId: "ch_a1", regionId: "reg_a", summary: "Uploaded “Minutes — Chapter A1, 20 September 2026 (example)”" },
    { id: "au_11", at: "2026-09-16T09:00:00Z", actorId: "mem_s06", actorRoles: ["CHAPTER_PRESIDENT"], action: "UPLOAD", entityType: "document", entityId: "doc_7", chapterId: "ch_b1", regionId: "reg_b", summary: "Uploaded “Minutes — Chapter B1, 13 September 2026 (example)”" },
  ];

  const collections: Collection[] = [];
  const expenses: Expense[] = [];
  populate({ chapters, members, affiliations, assignments, contributions, collections, expenses });

  const accounts = [
    { email: "member@demo.ncuda.invalid", memberId: "mem_member", label: "Ordinary member" },
    { email: "president@demo.ncuda.invalid", memberId: "mem_cpres", label: "Chapter President" },
    { email: "finsec@demo.ncuda.invalid", memberId: "mem_finsec", label: "Financial Secretary" },
    { email: "secretary@demo.ncuda.invalid", memberId: "mem_sec", label: "Chapter Secretary" },
    { email: "coordinator@demo.ncuda.invalid", memberId: "mem_coord", label: "Regional Coordinator" },
    { email: "president.general@demo.ncuda.invalid", memberId: "mem_pg", label: "President General" },
    { email: "central.finsec@demo.ncuda.invalid", memberId: "mem_cfs", label: "National Financial Secretary" },
    { email: "secretary.general@demo.ncuda.invalid", memberId: "mem_secgen", label: "National Secretary General" },
    { email: "coordinator.b@demo.ncuda.invalid", memberId: "mem_coord_b", label: "Regional Coordinator (Region B)" },
    { email: "president.b2@demo.ncuda.invalid", memberId: "mem_b2_pres", label: "Chapter President (B2)" },
  ];
  // Keep member emails consistent with their sign-in emails.
  for (const a of accounts) members.find((x) => x.id === a.memberId)!.email = a.email;

  return {
    organization,
    regions,
    chapters,
    members,
    affiliations,
    assignments,
    delegations,
    meetings,
    attendance,
    minutes,
    decisions,
    actionItems,
    contributions,
    collections,
    expenses,
    documents,
    notifications,
    notificationReads: [{ notificationId: "nt_1", memberId: "mem_member", readAt: "2026-09-02T08:00:00Z" }],
    audit,
    accounts,
    seq: 1000,
  };
}

export const CLEAN_START_REGIONS = ["South-West", "North-West", "Diaspora"];

/**
 * A clean start for testing with real people: only the organisation, the
 * President General and the four regions (no coordinators yet, no chapters). Everyone else is created through the portal itself:
 * coordinators for the regions, chapters with their Presidents, then members.
 */
export function createCleanStart(): DemoDB {
  const full = createFixtures();
  const pg = "mem_pg";
  return {
    ...full,
    // The regions the President General starts with; each still needs its Regional Coordinator.
    regions: CLEAN_START_REGIONS.map((name) => ({ id: `reg_${name.toLowerCase().replace(/[^a-z]+/g, "_")}`, name })),
    // No chapters: Regional Coordinators create them. The President General
    // belongs to no chapter until they join one.
    chapters: [],
    members: full.members.filter((m) => m.id === pg),
    affiliations: [],
    assignments: full.assignments.filter((a) => a.memberId === pg && a.status === "active"),
    delegations: [],
    meetings: [],
    attendance: [],
    minutes: [],
    decisions: [],
    actionItems: [],
    contributions: [],
    collections: [],
    expenses: [],
    documents: [],
    notifications: [],
    notificationReads: [],
    audit: [],
    accounts: full.accounts.filter((a) => a.memberId === pg),
  };
}
