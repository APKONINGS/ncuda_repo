import "server-only";
import type { AuditEntry } from "@/lib/domain/types";
import { db, newId, scheduleSave } from "@/lib/demo/store";
import type { Actor } from "@/lib/permissions/engine";

/**
 * Appends an audit entry. Audit rows are append-only: there is no update or
 * delete path in the application, and the database denies both (see the
 * `audit_logs` policies in the migration).
 */
export function recordAudit(
  actor: Actor | null,
  entry: Omit<AuditEntry, "id" | "at" | "actorId" | "actorRoles" | "regionId"> & { regionId?: string | null },
) {
  const data = db();
  const regionId =
    entry.regionId !== undefined
      ? entry.regionId
      : entry.chapterId
        ? (data.chapters.find((c) => c.id === entry.chapterId)?.regionId ?? null)
        : null;

  data.audit.push({
    id: newId("au"),
    at: new Date().toISOString(),
    actorId: actor?.member.id ?? null,
    actorRoles: actor ? (actor.roles.length ? actor.roles.map((r) => r.role.key) : ["MEMBER"]) : [],
    ...entry,
    regionId,
  });
  scheduleSave();
}
