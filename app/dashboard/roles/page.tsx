import { AssignRoleForm, EndRoleButton } from "@/components/portal/forms";
import { AccessDenied, EmptyState, PageHeader, Panel, Pill, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions/catalog";
import { canEndRole, hasAnywhere } from "@/lib/permissions/engine";
import { roleName } from "@/lib/permissions/roles";
import { currentPost, listMembers, rolesOverview, assignableRegions, postHolders, chapterRegionOf } from "@/lib/portal/queries";
import { org } from "@/lib/portal/visibility";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Roles & access" };

export default async function RolesPage() {
  const actor = await requireActor();
  const data = rolesOverview(actor);
  if (!data) return <AccessDenied />;

  const canAssign = hasAnywhere(actor, "ASSIGN_ROLE");
  const assignable = new Set(actor.roles.flatMap((r) => r.role.assignableRoles));
  const members = canAssign
    ? (listMembers(actor)?.rows ?? []).filter((m) => m.status === "active" && m.id !== actor.member.id)
    : [];
  const active = data.assignments.filter((a) => a.status === "active");
  const history = data.assignments.filter((a) => a.status === "ended");
  const o = org();

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Roles & access"
      />

      {canAssign && assignable.size > 0 && members.length > 0 && (
        <Panel title="Assign a role" tone="cream">
          <AssignRoleForm
            members={members.map((m) => {
              const post = currentPost(m.id);
              return {
                id: m.id,
                fullName: m.fullName,
                chapterName: m.chapterName,
                chapterId: m.chapterId,
                regionId: chapterRegionOf(m.chapterId),
                currentPost: post ? { assignmentId: post.assignment.id, label: post.label, canEnd: canEndRole(actor, post.assignment, o).ok } : undefined,
              };
            })}
            roles={data.roles.filter((r) => assignable.has(r.key)).map(({ key, name, scopeLevel }) => ({ key, name, scopeLevel }))}
            regions={assignableRegions(actor)}
            holders={postHolders(actor)}
          />
        </Panel>
      )}

      <Panel title="Current office holders" bodyClassName="overflow-x-auto">
        {active.length === 0 ? (
          <EmptyState compact title="No active roles in your scope" />
        ) : (
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Member</th>
                <th scope="col" className={t.th}>Role</th>
                <th scope="col" className={`${t.th} hidden md:table-cell`}>Scope</th>
                <th scope="col" className={`${t.th} hidden lg:table-cell`}>Assigned</th>
                <th scope="col" className={`${t.th} text-right`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td className={`${t.td} font-medium text-ink-900`}>
                    {a.memberName}
                    <Contact contact={contactFor(actor, a.memberId)} />
                  </td>
                  <td className={t.td}>{roleName(a.roleKey)}</td>
                  <td className={`${t.td} hidden md:table-cell`}>{a.scopeLabel}</td>
                  <td className={`${t.td} hidden text-xs lg:table-cell`}>
                    {formatDate(a.assignedAt)}
                    <span className="block text-ink-500">by {a.assignedByName}</span>
                    <Contact contact={contactFor(actor, a.assignedBy)} />
                  </td>
                  <td className={`${t.td} text-right`}>
                    {canEndRole(actor, a, o).ok && <EndRoleButton assignmentId={a.id} label={`${roleName(a.roleKey)} for ${a.memberName}`} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {history.length > 0 && (
        <Panel title="Role history" tone="cream" bodyClassName="overflow-x-auto">
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Member</th>
                <th scope="col" className={t.th}>Role</th>
                <th scope="col" className={t.th}>Period</th>
                <th scope="col" className={`${t.th} hidden md:table-cell`}>Uplifted by / reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id}>
                  <td className={`${t.td} font-medium text-ink-900`}>
                    {a.memberName}
                    <Contact contact={contactFor(actor, a.memberId)} />
                  </td>
                  <td className={t.td}>
                    {roleName(a.roleKey)}
                    <span className="block text-xs text-ink-500">{a.scopeLabel}</span>
                  </td>
                  <td className={`${t.td} num whitespace-nowrap text-xs`}>
                    {formatDate(a.assignedAt)} → {a.endedAt && formatDate(a.endedAt)}
                  </td>
                  <td className={`${t.td} hidden text-xs md:table-cell`}>
                    {a.endedByName}
                    <Contact contact={contactFor(actor, a.endedBy)} />
                    {a.endReason && <span className="block text-ink-500">{a.endReason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {data.delegations.length > 0 && (
        <Panel title="Authority delegations">
          <ul className="grid gap-4">
            {data.delegations.map((d) => (
              <li key={d.id} className="rounded-[var(--radius-md)] border border-line bg-paper p-4 text-sm">
                <p className="text-ink-900">
                  <span className="font-medium">{d.grantedByName}</span> delegated to <span className="font-medium">{d.grantedToName}</span>
                </p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {d.permissions.map((p) => <Pill key={p} tone="gold">{PERMISSIONS[p].label}</Pill>)}
                  <Pill>{d.scopeLabel}</Pill>
                  <Pill tone={d.status === "active" ? "green" : "neutral"}>{d.status}</Pill>
                </p>
                <p className="num mt-2 text-xs text-ink-500">
                  {formatDate(d.startsAt)} → {d.endsAt ? formatDate(d.endsAt) : "until revoked"}
                </p>
                {d.note && <p className="mt-1 text-xs text-ink-500">{d.note}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Permission matrix */}
      <Panel title="Role permissions" action={<span className="text-xs text-ink-500">Default configuration — to be confirmed by NCUDA</span>} bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-[#fcfaf6] py-3 pr-4 text-left font-semibold uppercase tracking-[0.1em] text-ink-500">Permission</th>
              {data.roles.map((r) => (
                <th key={r.key} scope="col" className="px-1.5 py-3 align-bottom font-medium text-ink-700">
                  <span className="block w-16 text-center leading-tight">{r.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <PermissionGroupRows key={group} group={group} roles={data.roles} />
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function PermissionGroupRows({ group, roles }: { group: string; roles: Array<{ key: string; permissions: string[] }> }) {
  const perms = ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].group === group);
  return (
    <>
      <tr>
        <th colSpan={roles.length + 1} scope="colgroup" className="border-b border-line-strong pb-2 pt-5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-earth-700">
          {group}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-b border-line">
          <th scope="row" className="sticky left-0 bg-[#fcfaf6] py-2 pr-4 text-left font-normal text-ink-700">{PERMISSIONS[p].label}</th>
          {roles.map((r) => (
            <td key={r.key} className="px-1.5 py-2 text-center">
              {r.permissions.includes(p) ? (
                <span className="inline-block h-2.5 w-2.5 rotate-45 bg-forest-700" role="img" aria-label="Granted" />
              ) : (
                <span className="inline-block h-1 w-1 rounded-full bg-line-strong" role="img" aria-label="Not granted" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
