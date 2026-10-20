/**
 * NCUDA domain model.
 *
 * These types mirror the Supabase schema in supabase/migrations. The demo
 * store and (later) the Supabase repositories both produce these shapes, so
 * portal pages do not care where data comes from.
 */
import type { Permission } from "@/lib/permissions/catalog";

export type ID = string;
export type ISODate = string;

/* ── Organisation structure ───────────────────────────────────────────── */

export type ScopeLevel = "organization" | "region" | "chapter";

export type Scope =
  | { level: "organization" }
  | { level: "region"; regionId: ID }
  | { level: "chapter"; chapterId: ID };

export interface Organization {
  id: ID;
  name: string;
}

export interface Region {
  id: ID;
  name: string;
}

export interface Chapter {
  id: ID;
  name: string;
  /** Chapters may sit inside a region or report directly to the organisation. */
  regionId: ID | null;
  location: string;
  /** The chapter's registration fee (one amount for everyone), set by its Financial Secretary. */
  registrationFee?: number;
}

/* ── Members ──────────────────────────────────────────────────────────── */

export type MembershipStatus = "active" | "suspended" | "inactive";

export interface Member {
  id: ID;
  fullName: string;
  email: string;
  phone?: string;
  memberNumber: string;
  status: MembershipStatus;
  /** The latest status change (full history is in the audit log). */
  statusChange?: { by: ID; at: ISODate; reason: string };
  joinedAt: ISODate;
  createdBy: ID | null;
  createdAt: ISODate;
}

/** Chapter history — never overwrite; close the old row and open a new one. */
export interface ChapterAffiliation {
  id: ID;
  memberId: ID;
  chapterId: ID;
  startedAt: ISODate;
  endedAt: ISODate | null;
  recordedBy: ID | null;
  note?: string;
}

/* ── Roles & authority ────────────────────────────────────────────────── */

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  /** The scope level this role is held at. */
  scopeLevel: ScopeLevel;
  permissions: Permission[];
  /** Roles a holder of this role may assign/remove (within their own scope). */
  assignableRoles: string[];
  /** Display order / seniority. */
  rank: number;
}

/** Role history — rows are ended, never deleted. */
export interface RoleAssignment {
  id: ID;
  memberId: ID;
  roleKey: string;
  scope: Scope;
  status: "active" | "ended";
  assignedBy: ID | null;
  assignedAt: ISODate;
  endedAt: ISODate | null;
  endedBy: ID | null;
  endReason?: string;
}

export interface AuthorityDelegation {
  id: ID;
  grantedBy: ID;
  grantedTo: ID;
  scope: Scope;
  permissions: Permission[];
  startsAt: ISODate;
  endsAt: ISODate | null;
  status: "active" | "revoked";
  note?: string;
  createdAt: ISODate;
}

/* ── Meetings ─────────────────────────────────────────────────────────── */

export type MeetingStatus = "scheduled" | "held" | "cancelled";

export interface Meeting {
  id: ID;
  title: string;
  startsAt: ISODate;
  endsAt?: ISODate;
  location: string;
  scope: Scope;
  status: MeetingStatus;
  agenda: string[];
  createdBy: ID;
  /**
   * Who the meeting is for (absent = "all"): every member of its chapter, region
   * or the organisation; only those holding a post within it; or chosen people.
   */
  audience?: MeetingAudience;
  /** For a "selected" meeting: the people invited… */
  inviteeIds?: ID[];
  /** …and (national meetings) whole regions and chapters, all of whose members are invited. */
  inviteeRegionIds?: ID[];
  inviteeChapterIds?: ID[];
  /** Why it was cancelled. */
  cancelReason?: string;
  /** Cancelled after its start time: it did not take place ("Not held"). */
  notHeld?: boolean;
  /** Automatic reminders already sent: the day before, and the morning of the meeting. */
  remindersSent?: MeetingReminder[];
}

export type MeetingReminder = "day" | "morning";

export type MeetingAudience = "all" | "executives" | "selected";

export type AttendanceStatus = "present" | "absent" | "excused" | "late";

export interface AttendanceRecord {
  id: ID;
  meetingId: ID;
  memberId: ID;
  chapterId: ID;
  status: AttendanceStatus;
  recordedBy: ID;
  recordedAt: ISODate;
}

export interface MeetingMinutes {
  id: ID;
  meetingId: ID;
  status: "draft" | "published";
  discussion: string;
  keyIssues: string[];
  resolutions: string[];
  recordedBy: ID;
  updatedAt: ISODate;
  publishedAt?: ISODate;
}

export interface Decision {
  id: ID;
  meetingId: ID;
  text: string;
  recordedBy: ID;
  createdAt: ISODate;
}

export type ActionStatus = "pending" | "in_progress" | "completed";

export interface ActionItem {
  id: ID;
  decisionId: ID;
  meetingId: ID;
  title: string;
  assigneeId: ID;
  dueDate: ISODate;
  status: ActionStatus;
  completedAt?: ISODate;
  completedBy?: ID;
}

/* ── Finance (records only — no payment processing) ───────────────────── */

/**
 * The only two kinds of payment:
 * "contribution": a payment towards a project (collection).
 * "fine": a penalty — never part of a collection.
 */
export type ContributionType = "contribution" | "fine";

/**
 * A project (collection), e.g. "Tractor purchase". Organisation-wide
 * projects are raised chapter by chapter; regions and chapters can run their
 * own. Each sets what every executive and every ordinary member is expected
 * to pay; contributions are always made towards a project.
 */
export interface Collection {
  id: ID;
  /** Shown as "Project". */
  name: string;
  /** The project's purpose — becomes the description of every contribution to it. */
  description: string;
  scope: Scope;
  /** Whole XAF each person is expected to pay. */
  expected: { executive: number; member: number };
  startsOn: ISODate;
  endsOn?: ISODate;
  createdBy: ID;
  createdAt: ISODate;
}

export interface Contribution {
  id: ID;
  /**
   * "chapter": kept by the chapter's Financial Secretary (the default).
   * "central": money received directly by the central body, kept by the
   * National Financial Secretary.
   * "committee": money paid to a committee for its project, kept by the
   * committee's Financial Secretary (see `committeeId`).
   */
  ledger: "chapter" | "central" | "committee";
  /** For the committee ledger: which committee received it. */
  committeeId?: ID;
  /** The paying member. */
  memberId: ID;
  /** The member's chapter when the payment was recorded. */
  chapterId: ID;
  type: ContributionType;
  /** The project this payment was made towards — required for contributions (except a registration fee), never set for fines. */
  collectionId?: ID;
  /** A registration fee (paid on joining, or for a yearly renewal) at the chapter's amount; it counts as the registration for `year`. */
  registrationFee?: { year: number };
  /** For a contribution, the project's purpose; for a fine, its reason. */
  description: string;
  /**
   * What the payer was expected to pay, captured when recorded: the project's
   * per-person amount for a contribution, or the fine imposed for a new fine.
   * Absent for payments towards an earlier fine.
   */
  expectedAmount?: number;
  /** Amount paid, whole XAF. May be 0 only when a fine is imposed but not yet paid. */
  amount: number;
  /** For a payment towards an earlier, partly paid fine: that fine's record. */
  settlesFineId?: ID;
  currency: "XAF";
  receivedOn: ISODate;
  /** Receipt number, generated automatically (e.g. RC-2026-00042). */
  reference: string;
  status: "recorded" | "voided";
  recordedBy: ID;
  recordedAt: ISODate;
  voidedBy?: ID;
  voidedAt?: ISODate;
  voidReason?: string;
}

/**
 * Money spent from a chapter's, a region's or the central body's funds
 * (e.g. meeting refreshments). Recorded by the officer who keeps those
 * funds; visible up the hierarchy. Voided, never deleted.
 */
export interface Expense {
  id: ID;
  /** Whose funds: a chapter, a region or the organisation (central). */
  scope: Scope;
  /** Money the committee's creator gave to this committee (shown only to those who can see its books). */
  committeeId?: ID;
  /** Project money a chapter sent to the creator of the project's committees. */
  sentFor?: { collectionId: ID; toMemberId: ID };
  description: string;
  /** Who was paid, if recorded. */
  paidTo?: string;
  /** Whole XAF, > 0. */
  amount: number;
  currency: "XAF";
  spentOn: ISODate;
  /** Voucher number, generated automatically (e.g. PV-2026-00007). */
  reference: string;
  status: "recorded" | "voided";
  recordedBy: ID;
  recordedAt: ISODate;
  voidedBy?: ID;
  voidedAt?: ISODate;
  voidReason?: string;
}

/**
 * A yearly registration renewal, started by the President General. From that
 * moment every member who joined before it is inactive until their
 * registration fee for the year (a project, `collectionId`) is paid in full.
 */
export interface RegistrationRenewal {
  id: ID;
  year: number;
  /** Older renewals created a project; renewals now use each chapter's registration fee. */
  collectionId?: ID;
  openedBy: ID;
  openedAt: ISODate;
}

/* ── Committees ───────────────────────────────────────────────────────── */

/** Positions in a committee (mirroring a chapter's EXCO); null = ordinary committee member. */
export type CommitteePosition = "PRESIDENT" | "VICE_PRESIDENT" | "SECRETARY" | "FINANCIAL_SECRETARY" | "TREASURER";

/**
 * A committee set up to carry out a project: national (created by the
 * President General) or regional (by that region's Regional Coordinator).
 * It always has its project (`collectionId`), raised across its scope.
 * Committee positions are separate from chapter and regional posts.
 */
export interface Committee {
  id: ID;
  name: string;
  purpose: string;
  /** organisation (national) or region (regional). */
  scope: Scope;
  collectionId: ID;
  createdBy: ID;
  createdAt: ISODate;
  status: "active" | "dissolved";
  dissolvedBy?: ID;
  dissolvedAt?: ISODate;
  dissolveReason?: string;
}

/**
 * A committee's own meeting — with its attendance and minutes — seen only by
 * those who can see the committee.
 */
export interface CommitteeMeeting {
  id: ID;
  committeeId: ID;
  title: string;
  startsAt: ISODate;
  location: string;
  agenda: string[];
  status: "scheduled" | "held" | "cancelled";
  createdBy: ID;
  createdAt: ISODate;
  attendance: Array<{ memberId: ID; status: AttendanceStatus; recordedBy: ID; recordedAt: ISODate }>;
  /** Written by the committee's Secretary; visible to everyone once published. */
  minutes?: {
    text: string;
    decisions: string[];
    status: "draft" | "published";
    recordedBy: ID;
    updatedAt: ISODate;
    publishedAt?: ISODate;
  };
}

/** A person's place on a committee (with or without a position). Ended, never deleted. */
export interface CommitteeMembership {
  id: ID;
  committeeId: ID;
  memberId: ID;
  position: CommitteePosition | null;
  addedBy: ID;
  addedAt: ISODate;
  endedAt: ISODate | null;
  endedBy?: ID;
  endReason?: string;
}

/* ── Documents (metadata; files live in Supabase Storage) ─────────────── */

export type DocumentCategory = "minutes" | "association" | "reports" | "financial" | "forms" | "other";

export interface DocumentRecord {
  id: ID;
  title: string;
  filename: string;
  category: DocumentCategory;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  /** Who may view it: everyone in `scope`, or only holders of `roleKeys` within it. */
  scope: Scope;
  roleKeys?: string[];
  /** Sent as an attachment to a message (its visibility then follows the message). */
  attachment?: boolean;
  meetingId?: ID;
  uploadedBy: ID;
  uploadedAt: ISODate;
  /** A committee's own document (visible only to those who can see the committee). */
  committeeId?: ID;
  /** For a committee document: the committee meeting it belongs to, if any. */
  committeeMeetingId?: ID;
}

/* ── Notifications ────────────────────────────────────────────────────── */

export type NotificationType =
  | "meeting_reminder"
  | "announcement"
  | "document_uploaded"
  | "action_assigned"
  | "action_due"
  | "minutes_published"
  | "message"
  /** A payment receipt (or a fine imposed, or a record voided), sent to the payer. */
  | "receipt";

export interface NotificationRecord {
  id: ID;
  type: NotificationType;
  title: string;
  body: string;
  /**
   * member — one person · scope — everyone in a part of the organisation ·
   * group — only holders of the given roles within a scope
   * (e.g. every Chapter President in the organisation).
   */
  audience:
    | { kind: "member"; memberId: ID }
    | { kind: "scope"; scope: Scope }
    | { kind: "group"; scope: Scope; roleKeys: string[] };
  /**
   * Set when this record is a forward. Title and body are copied unchanged
   * from the original; the forwarder may only add a separate note.
   */
  /** Documents attached to this message (forwards carry them unchanged). */
  attachmentIds?: ID[];
  /** Set on committee messages, so they (and their attachments) are listed on the committee's page. */
  committeeId?: ID;
  forward?: {
    /** The original message (always the first, never an intermediate forward). */
    originalId: ID;
    originalSenderId: ID | null;
    originalSentAt: ISODate;
    /** Earlier forwarders, oldest first (the current forwarder is `createdBy`). */
    via: ID[];
    note?: string;
  };
  link?: string;
  createdBy: ID | null;
  createdAt: ISODate;
}

/* ── Audit ────────────────────────────────────────────────────────────── */

export type AuditAction =
  | "CREATE"
  | "VIEW"
  | "UPDATE"
  | "DELETE"
  | "VOID"
  | "APPROVE"
  | "REJECT"
  | "ASSIGN_ROLE"
  | "REMOVE_ROLE"
  | "UPLOAD"
  | "DOWNLOAD"
  | "EXPORT"
  | "LOGIN"
  | "LOGOUT";

export interface AuditEntry {
  id: ID;
  at: ISODate;
  actorId: ID | null;
  /** Role keys the actor held at the moment of the action. */
  actorRoles: string[];
  action: AuditAction;
  entityType: string;
  entityId: ID | null;
  chapterId: ID | null;
  regionId: ID | null;
  summary: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
}
