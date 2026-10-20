/**
 * Permission catalogue. Permissions are granular; roles bundle them; every
 * grant is bound to a scope (organisation, region or chapter).
 *
 * Keep this list in sync with `public.permissions` in the Supabase migration.
 */
export const PERMISSIONS = {
  CREATE_REGION: { group: "Organisation", label: "Create regions and appoint their Regional Coordinator" },
  MANAGE_REGISTRATION: { group: "Organisation", label: "Start the yearly registration renewal" },
  CREATE_COMMITTEE: { group: "Organisation", label: "Create committees for projects and appoint their members" },
  CREATE_CHAPTER: { group: "Organisation", label: "Create chapters and their founding EXCO" },

  CREATE_MEMBER: { group: "Members", label: "Create member accounts" },
  VIEW_MEMBER: { group: "Members", label: "View member records" },
  EDIT_MEMBER: { group: "Members", label: "Edit member records" },
  SUSPEND_MEMBER: { group: "Members", label: "Suspend or reinstate members" },
  TRANSFER_MEMBER: { group: "Members", label: "Move members to another chapter" },

  ASSIGN_ROLE: { group: "Roles", label: "Assign roles" },
  REMOVE_ROLE: { group: "Roles", label: "Remove roles" },

  CREATE_MEETING: { group: "Meetings", label: "Create meetings" },
  EDIT_MEETING: { group: "Meetings", label: "Edit meetings" },
  DELETE_MEETING: { group: "Meetings", label: "Cancel / delete meetings" },
  RECORD_ATTENDANCE: { group: "Meetings", label: "Record attendance" },
  CREATE_MINUTES: { group: "Meetings", label: "Write minutes" },
  EDIT_MINUTES: { group: "Meetings", label: "Edit minutes" },
  CREATE_DECISION: { group: "Meetings", label: "Record decisions" },
  EDIT_DECISION: { group: "Meetings", label: "Edit decisions" },
  CREATE_ACTION_ITEM: { group: "Meetings", label: "Create action items" },
  EDIT_ACTION_ITEM: { group: "Meetings", label: "Edit action items" },
  COMPLETE_ACTION_ITEM: { group: "Meetings", label: "Complete any action item" },

  VIEW_CONTRIBUTIONS: { group: "Finance", label: "View contribution records" },
  RECORD_CONTRIBUTION: { group: "Finance", label: "Record contributions" },
  EDIT_CONTRIBUTION: { group: "Finance", label: "Correct contributions" },
  VOID_CONTRIBUTION: { group: "Finance", label: "Cancel payments" },
  MANAGE_COLLECTIONS: { group: "Finance", label: "Create new projects (contributions)" },
  RECORD_EXPENSE: { group: "Finance", label: "Record and void expenses" },
  VIEW_FINANCIAL_REPORTS: { group: "Finance", label: "View financial reports" },

  UPLOAD_DOCUMENT: { group: "Documents", label: "Upload documents" },
  DOWNLOAD_DOCUMENT: { group: "Documents", label: "Download documents" },
  DELETE_DOCUMENT: { group: "Documents", label: "Delete documents" },

  MANAGE_NOTIFICATIONS: { group: "Communication", label: "Send notifications" },

  VIEW_AUDIT_LOG: { group: "Oversight", label: "View audit log" },
  EXPORT_DATA: { group: "Oversight", label: "Export data" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS = Array.from(new Set(Object.values(PERMISSIONS).map((p) => p.group)));
