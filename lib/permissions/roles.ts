import type { RoleDefinition } from "@/lib/domain/types";

/**
 * DEFAULT role configuration.
 *
 * This is a starting point, not NCUDA policy. In production these rows live in
 * `public.roles` / `public.role_permissions` and are edited by the
 * organisation. Notably:
 *   - Presidents can VIEW finances but cannot record, edit or void them.
 *   - The President General leads with a central EXCO (Vice President
 *     General, National Secretary General, National Financial Secretary, Central
 *     Treasurer), the supreme body above the chapter EXCOs.
 *   - Chapters are created, with their founding EXCO, by the Regional
 *     Coordinator of their region. Chapters outside any region report
 *     directly to the organisation and are created by the President General.
 *   - From then on each Chapter President runs their chapter and appoints the
 *     other chapter officers; the chapter's Financial Secretary registers
 *     members (CREATE_MEMBER), since members pay their registration to them.
 *   - Who may appoint whom is configured separately (`assignableRoles`).
 */

const CHAPTER_ROLES = [
  "CHAPTER_PRESIDENT",
  "CHAPTER_VICE_PRESIDENT",
  "CHAPTER_SECRETARY",
  "CHAPTER_VICE_SECRETARY",
  "TREASURER",
  "FINANCIAL_SECRETARY",
  "SOCIALS",
  "SOCIALS_VICE",
];

export const ROLES: RoleDefinition[] = [
  {
    key: "PRESIDENT_GENERAL",
    name: "President General",
    description: "Leads NCUDA as a whole. Delegates authority to regional and chapter leadership.",
    scopeLevel: "organization",
    rank: 1,
    permissions: [
      "CREATE_REGION",
      "MANAGE_REGISTRATION",
      "CREATE_COMMITTEE",
      "TRANSFER_MEMBER",
      "SUSPEND_MEMBER",
      "VIEW_MEMBER",
      "ASSIGN_ROLE",
      "REMOVE_ROLE",
      "EDIT_MEETING",
      "DELETE_MEETING",
      "VIEW_CONTRIBUTIONS",
      "VIEW_FINANCIAL_REPORTS",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "MANAGE_NOTIFICATIONS",
      "VIEW_AUDIT_LOG",
      "EXPORT_DATA",
    ],
    assignableRoles: [
      "VICE_PRESIDENT_GENERAL",
      "SECRETARY_GENERAL",
      "CENTRAL_FINANCIAL_SECRETARY",
      "CENTRAL_TREASURER",
      "REGIONAL_COORDINATOR",
      "CHAPTER_PRESIDENT",
    ],
  },
  {
    key: "VICE_PRESIDENT_GENERAL",
    name: "Vice President General",
    description: "Deputises for the President General, with all of the President General's powers.",
    scopeLevel: "organization",
    rank: 2,
    permissions: [], // the President General's, set below
    assignableRoles: [],
  },
  {
    key: "SECRETARY_GENERAL",
    name: "National Secretary General",
    description: "Keeps the central records: general meetings, minutes, correspondence and documents.",
    scopeLevel: "organization",
    rank: 3,
    permissions: [
      "VIEW_MEMBER",
      "CREATE_MEETING",
      "EDIT_MEETING",
      "RECORD_ATTENDANCE",
      "CREATE_MINUTES",
      "EDIT_MINUTES",
      // Decisions and their actions are recorded, kept up to date and marked done by the Secretary.
      "CREATE_DECISION",
      "EDIT_DECISION",
      "CREATE_ACTION_ITEM",
      "EDIT_ACTION_ITEM",
      "COMPLETE_ACTION_ITEM",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "MANAGE_NOTIFICATIONS",
    ],
    assignableRoles: [],
  },
  {
    key: "CENTRAL_FINANCIAL_SECRETARY",
    name: "National Financial Secretary",
    description: "Keeps the central ledger (money received and spent by the central body), oversees all chapters' records, and creates organisation-wide projects.",
    scopeLevel: "organization",
    rank: 4,
    // The full Financial Secretary set, at central level. Writes apply to the
    // central ledger only (see canWriteLedger); chapter ledgers stay with chapters.
    permissions: [
      "VIEW_MEMBER",
      "VIEW_CONTRIBUTIONS",
      "RECORD_CONTRIBUTION",
      "EDIT_CONTRIBUTION",
      "VOID_CONTRIBUTION",
      "MANAGE_COLLECTIONS",
      "RECORD_EXPENSE",
      "VIEW_FINANCIAL_REPORTS",
      "EXPORT_DATA",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
    ],
    assignableRoles: [],
  },
  {
    key: "CENTRAL_TREASURER",
    name: "Central Treasurer",
    description: "Safeguards the central funds and reviews financial records across chapters.",
    scopeLevel: "organization",
    rank: 5,
    permissions: ["VIEW_CONTRIBUTIONS", "VIEW_FINANCIAL_REPORTS", "DOWNLOAD_DOCUMENT"],
    assignableRoles: [],
  },
  {
    key: "REGIONAL_COORDINATOR",
    name: "Regional Coordinator",
    description: "Coordinates the chapters of a region on behalf of the central organisation.",
    scopeLevel: "region",
    rank: 6,
    permissions: [
      "CREATE_CHAPTER",
      "TRANSFER_MEMBER",
      "CREATE_COMMITTEE",
      "VIEW_MEMBER",
      "CREATE_MEETING",
      "EDIT_MEETING",
      "RECORD_ATTENDANCE",
      // No regional Secretary post: the coordinator writes and publishes the minutes of regional meetings.
      "CREATE_MINUTES",
      "EDIT_MINUTES",
      // Decisions and their actions are recorded, kept up to date and marked done by the Secretary.
      "CREATE_DECISION",
      "EDIT_DECISION",
      "CREATE_ACTION_ITEM",
      "EDIT_ACTION_ITEM",
      "COMPLETE_ACTION_ITEM",
      // Regional projects (e.g. a regional cultural day) and the region's own spending.
      "MANAGE_COLLECTIONS",
      "RECORD_EXPENSE",
      "VIEW_FINANCIAL_REPORTS",
      // Read-only individual records across the region's chapters: who paid, who still owes, fines, registration.
      "VIEW_CONTRIBUTIONS",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "MANAGE_NOTIFICATIONS",
      "VIEW_AUDIT_LOG",
    ],
    assignableRoles: [],
  },
  {
    key: "CHAPTER_PRESIDENT",
    name: "Chapter President",
    description: "Leads a chapter: enrols its members, appoints its officers, and runs its meetings and decisions.",
    scopeLevel: "chapter",
    rank: 7,
    permissions: [
      "VIEW_MEMBER",
      "EDIT_MEMBER",
      "SUSPEND_MEMBER",
      "ASSIGN_ROLE",
      "REMOVE_ROLE",
      "EDIT_MEETING",
      // Chapter committees, for the chapter's own projects.
      "CREATE_COMMITTEE",
      "VIEW_CONTRIBUTIONS",
      "VIEW_FINANCIAL_REPORTS",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "MANAGE_NOTIFICATIONS",
      "VIEW_AUDIT_LOG",
    ],
    assignableRoles: CHAPTER_ROLES.filter((r) => r !== "CHAPTER_PRESIDENT"),
  },
  {
    key: "CHAPTER_VICE_PRESIDENT",
    name: "Chapter Vice President",
    description: "Deputises for the Chapter President, with all of the Chapter President's powers.",
    scopeLevel: "chapter",
    rank: 8,
    permissions: [], // the Chapter President's, set below
    assignableRoles: [],
  },
  {
    key: "CHAPTER_SECRETARY",
    name: "Chapter Secretary",
    description: "Keeps the chapter’s records: meetings, attendance and minutes.",
    scopeLevel: "chapter",
    rank: 9,
    permissions: [
      "VIEW_MEMBER",
      "CREATE_MEETING",
      "EDIT_MEETING",
      "RECORD_ATTENDANCE",
      "CREATE_MINUTES",
      "EDIT_MINUTES",
      // Decisions and their actions are recorded, kept up to date and marked done by the Secretary.
      "CREATE_DECISION",
      "EDIT_DECISION",
      "CREATE_ACTION_ITEM",
      "EDIT_ACTION_ITEM",
      "COMPLETE_ACTION_ITEM",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "MANAGE_NOTIFICATIONS",
    ],
    assignableRoles: [],
  },
  {
    key: "CHAPTER_VICE_SECRETARY",
    name: "Chapter Vice Secretary",
    description: "Assists the Secretary with attendance and minutes.",
    scopeLevel: "chapter",
    rank: 10,
    permissions: ["VIEW_MEMBER", "RECORD_ATTENDANCE", "CREATE_MINUTES", "DOWNLOAD_DOCUMENT"],
    assignableRoles: [],
  },
  {
    key: "TREASURER",
    name: "Treasurer",
    description: "Safeguards the chapter’s funds and reviews financial records.",
    scopeLevel: "chapter",
    rank: 11,
    permissions: ["VIEW_CONTRIBUTIONS", "VIEW_FINANCIAL_REPORTS", "DOWNLOAD_DOCUMENT"],
    assignableRoles: [],
  },
  {
    key: "FINANCIAL_SECRETARY",
    name: "Financial Secretary",
    description: "Keeps the chapter's books: contributions, fines and the chapter's spending.",
    scopeLevel: "chapter",
    rank: 12,
    permissions: [
      // Members pay their registration to the Financial Secretary, who therefore registers them.
      "CREATE_MEMBER",
      "VIEW_MEMBER",
      "VIEW_CONTRIBUTIONS",
      "RECORD_CONTRIBUTION",
      "EDIT_CONTRIBUTION",
      "VOID_CONTRIBUTION",
      "MANAGE_COLLECTIONS",
      "RECORD_EXPENSE",
      "VIEW_FINANCIAL_REPORTS",
      "UPLOAD_DOCUMENT",
      "DOWNLOAD_DOCUMENT",
      "EXPORT_DATA",
    ],
    assignableRoles: [],
  },
  {
    key: "SOCIALS",
    name: "Socials",
    description: "Organises the chapter’s social and cultural life.",
    scopeLevel: "chapter",
    rank: 13,
    permissions: ["MANAGE_NOTIFICATIONS", "DOWNLOAD_DOCUMENT"],
    assignableRoles: [],
  },
  {
    key: "SOCIALS_VICE",
    name: "Socials Vice",
    description: "Supports the Socials officer.",
    scopeLevel: "chapter",
    rank: 14,
    permissions: ["DOWNLOAD_DOCUMENT"],
    assignableRoles: [],
  },
];

/**
 * Vice Presidents hold all of their President's powers, appointing included —
 * but they do not appoint to their own post or to the President's.
 */
function deputise(viceKey: string, presidentKey: string) {
  const vice = ROLES.find((r) => r.key === viceKey)!;
  const president = ROLES.find((r) => r.key === presidentKey)!;
  vice.permissions = [...president.permissions];
  vice.assignableRoles = president.assignableRoles.filter((k) => k !== viceKey && k !== presidentKey);
}
deputise("VICE_PRESIDENT_GENERAL", "PRESIDENT_GENERAL");
deputise("CHAPTER_VICE_PRESIDENT", "CHAPTER_PRESIDENT");

/** Every active member implicitly holds this baseline at their own chapter. */
export const MEMBER_BASELINE = {
  key: "MEMBER",
  name: "Member",
  description: "Ordinary member. Sees their own records and their chapter’s meetings, documents and notices.",
  permissions: ["DOWNLOAD_DOCUMENT"] as const,
};

export const roleByKey = new Map(ROLES.map((r) => [r.key, r]));

export function roleName(key: string) {
  return key === MEMBER_BASELINE.key ? MEMBER_BASELINE.name : (roleByKey.get(key)?.name ?? key);
}

/** Plural form for group labels ("all Chapter Secretaries"). */
export function rolePlural(key: string) {
  const special: Record<string, string> = { SOCIALS: "Socials officers", SOCIALS_VICE: "Socials Vice officers" };
  if (special[key]) return special[key];
  const name = roleName(key);
  return name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`;
}
