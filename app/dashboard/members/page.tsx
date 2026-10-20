import { ExportLink, PrintButton } from "@/components/portal/PageTools";
import Link from "next/link";
import { AccessDenied, EmptyState, PageHeader, Panel, Pill, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { roleName } from "@/lib/permissions/roles";
import { chapterName, listMembers, registrationToCollect } from "@/lib/portal/queries";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: PageProps<"/dashboard/members">) {
  // Open while unpaid: the Financial Secretary sets the registration amount and registers members.
  const actor = await requireActor({ allowInactive: true });
  const data = listMembers(actor);
  if (!data) return <AccessDenied />;
  const collect = registrationToCollect(actor);

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const chapter = typeof params.chapter === "string" && data.chapterIds.includes(params.chapter) ? params.chapter : "";
  const rows = data.rows.filter(
    (m) => (!q || m.fullName.toLowerCase().includes(q) || m.memberNumber.toLowerCase().includes(q)) && (!chapter || m.chapterId === chapter),
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Members"
        actions={
          <>
            <ExportLink kind="members" />
            <PrintButton />
          </>
        }
        description={data.chapterIds.length === 1 ? chapterName(data.chapterIds[0]) : undefined}
      />

      {data.creatableChapterIds.length > 0 && (
        <Panel tone="cream">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">
              New members are registered — and registration fees collected — on the Registration page.
              {collect && collect.people.length > 0 && ` ${collect.people.length} registration${collect.people.length === 1 ? "" : "s"} still to collect.`}
            </p>
            <Link href="/dashboard/registration" className="text-sm font-medium text-earth-700 underline-offset-4 hover:underline">
              Go to Registration →
            </Link>
          </div>
        </Panel>
      )}

      <Panel bodyClassName="p-0 sm:p-0">
        <form key={`${q}|${chapter}`} className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6 print:hidden" role="search">
          <label htmlFor="q" className="sr-only">Search members</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search by name or member number" className="h-10 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-paper px-3 text-sm focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-forest-700/15" />
          {data.chapterIds.length > 1 && (
            <>
              <label htmlFor="chapter" className="sr-only">Chapter</label>
              <select id="chapter" name="chapter" defaultValue={chapter} className="h-10 rounded-[var(--radius-sm)] border border-line-strong bg-paper px-3 text-sm">
                <option value="">All chapters</option>
                {[...data.chapterIds].sort((a, b) => chapterName(a).localeCompare(chapterName(b), "en", { numeric: true, sensitivity: "base" })).map((id) => (
                  <option key={id} value={id}>{chapterName(id)}</option>
                ))}
              </select>
            </>
          )}
          <button type="submit" className="h-10 rounded-[var(--radius-sm)] bg-forest-800 px-4 text-sm font-medium text-paper hover:bg-forest-900">Filter</button>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="No members match">Try a different search.</EmptyState>
        ) : (
          <div className="overflow-x-auto px-5 sm:px-6">
            <table className={t.table}>
              <thead>
                <tr>
                  <th scope="col" className={t.th}>Member</th>
                  <th scope="col" className={`${t.th} hidden md:table-cell`}>Chapter</th>
                  <th scope="col" className={t.th}>Roles</th>
                  <th scope="col" className={`${t.th} hidden sm:table-cell`}>Phone</th>
                  <th scope="col" className={`${t.th} hidden md:table-cell`}>Email</th>
                  <th scope="col" className={`${t.th} hidden lg:table-cell`}>Member since</th>
                  <th scope="col" className={`${t.th} text-right`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className={t.td}>
                      <Link href={`/dashboard/members/${m.id}`} className="font-medium text-ink-900 hover:text-earth-700">{m.fullName}</Link>
                      <span className="num block text-xs text-ink-500">{m.memberNumber}</span>
                    </td>
                    <td className={`${t.td} hidden md:table-cell`}>{m.chapterName}</td>
                    <td className={t.td}>
                      <span className="flex flex-wrap gap-1">
                        {m.roles.length === 0 ? <span className="text-xs text-ink-500">Member</span> : m.roles.map((r) => <Pill key={r} tone="dark">{roleName(r)}</Pill>)}
                      </span>
                    </td>
                    <td className={`${t.td} hidden whitespace-nowrap sm:table-cell`}>
                      {m.phone ? (
                        <a href={`tel:${m.phone.replace(/s+/g, "")}`} className="num text-earth-700 underline-offset-4 hover:underline">
                          {m.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-500">Not provided</span>
                      )}
                    </td>
                    <td className={`${t.td} hidden md:table-cell`}>
                      <a href={`mailto:${m.email}`} className="break-all text-earth-700 underline-offset-4 hover:underline">
                        {m.email}
                      </a>
                    </td>
                    <td className={`${t.td} num hidden lg:table-cell`}>{formatDate(m.joinedAt)}</td>
                    <td className={`${t.td} text-right`}>
                      {m.status === "active" && m.registrationDue ? (
                        <Pill tone="neutral">inactive · {m.registrationDue} unpaid</Pill>
                      ) : (
                        <Pill tone={m.status === "active" ? "green" : m.status === "suspended" ? "earth" : "neutral"}>{m.status}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
