import { AccessDenied, EmptyState, PageHeader, Panel, Pill, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import type { AuditAction } from "@/lib/domain/types";
import { roleName } from "@/lib/permissions/roles";
import { listAudit } from "@/lib/portal/queries";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

const TONE: Partial<Record<AuditAction, "green" | "gold" | "earth" | "dark" | "neutral">> = {
  CREATE: "green",
  UPDATE: "gold",
  VOID: "earth",
  DELETE: "earth",
  ASSIGN_ROLE: "dark",
  REMOVE_ROLE: "earth",
};

function Values({ label, values }: { label: string; values?: Record<string, unknown> }) {
  if (!values || Object.keys(values).length === 0) return null;
  return (
    <div>
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-cream px-3 py-2 font-mono text-[0.6875rem] leading-relaxed text-ink-700">
        {JSON.stringify(values, null, 1).replace(/^\{\n|\n\}$/g, "")}
      </pre>
    </div>
  );
}

export default async function AuditLogPage({ searchParams }: PageProps<"/dashboard/audit-log">) {
  const actor = await requireActor();
  const all = listAudit(actor);
  if (!all) return <AccessDenied />;

  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : "";
  const entries = action ? all.filter((e) => e.action === action) : all;
  const actions = [...new Set(all.map((e) => e.action))].sort();

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Oversight"
        title="Audit log"
      />

      <form key={action} className="flex flex-wrap items-center gap-3" role="search">
        <label htmlFor="action" className="text-sm text-ink-500">Action</label>
        <select id="action" name="action" defaultValue={action} className="h-10 rounded-[var(--radius-sm)] border border-line-strong bg-paper px-3 text-sm">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a === "VOID" ? "CANCEL" : a}</option>)}
        </select>
        <button type="submit" className="h-10 rounded-[var(--radius-sm)] bg-forest-800 px-4 text-sm font-medium text-paper hover:bg-forest-900">Filter</button>
        <span className="num ml-auto text-sm text-ink-500">{entries.length} entries</span>
      </form>

      <Panel bodyClassName="overflow-x-auto">
        {entries.length === 0 ? (
          <EmptyState title="No entries" />
        ) : (
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>When</th>
                <th scope="col" className={t.th}>Who</th>
                <th scope="col" className={t.th}>Action</th>
                <th scope="col" className={t.th}>What happened</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className={`${t.td} num whitespace-nowrap text-xs`}>{formatDateTime(e.at)}</td>
                  <td className={`${t.td} text-xs`}>
                    <span className="font-medium text-ink-900">{e.actorName}</span>
                    <span className="block text-ink-500">{e.actorRoles.map(roleName).join(", ")}</span>
                  </td>
                  <td className={t.td}>
                    <Pill tone={TONE[e.action] ?? "neutral"}>{e.action === "VOID" ? "CANCEL" : e.action}</Pill>
                  </td>
                  <td className={t.td}>
                    <p className="text-ink-900">{e.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {e.entityType}
                      {e.entityId && ` · ${e.entityId}`}
                      {e.chapterName && ` · ${e.chapterName}`}
                    </p>
                    {e.reason && <p className="mt-1 text-xs text-earth-800">Reason: {e.reason}</p>}
                    {(e.oldValues || e.newValues) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-earth-700">Before / after</summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Values label="Before" values={e.oldValues} />
                          <Values label="After" values={e.newValues} />
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
