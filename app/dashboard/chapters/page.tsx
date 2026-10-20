import { CreateChapterForm } from "@/components/portal/CreateChapterForm";
import { EditChapterForm, RegionRow } from "@/components/portal/OrgEditForms";
import { AppointCoordinatorForm, CreateRegionForm } from "@/components/portal/RegionForms";
import { AccessDenied, PageHeader, Panel, Pill, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { roleName } from "@/lib/permissions/roles";
import { INITIAL_EXCO_ROLES } from "@/lib/portal/commands";
import { listChapters, listRegions } from "@/lib/portal/queries";
import { plural } from "@/lib/utils";

export const metadata = { title: "Regions & chapters" };

function AddPanel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-display text-lg text-forest-900">{title}</span>
          <span className="text-sm text-ink-500">{hint}</span>
        </span>
        <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-line px-6 py-6">{children}</div>
    </details>
  );
}

export default async function ChaptersPage() {
  // Setup stays open while unpaid: the President General creates regions, coordinators create chapters.
  const actor = await requireActor({ allowInactive: true });
  const data = listChapters(actor);
  const regions = listRegions(actor);
  if (!data) return <AccessDenied>Chapters are created by Regional Coordinators.</AccessDenied>;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Organisation"
        title={regions ? "Regions & chapters" : "Chapters"}
      />

      {regions && (
        <section aria-labelledby="regions-title" className="grid gap-4">
          <h2 id="regions-title" className="font-display text-2xl text-forest-900">
            Regions
          </h2>
          <AddPanel title="Create a region" hint="With its Regional Coordinator.">
            <CreateRegionForm candidates={regions.candidates} />
          </AddPanel>
          <Panel bodyClassName="overflow-x-auto">
            {regions.regions.length === 0 ? (
              <p className="text-sm text-ink-500">No regions yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {regions.regions.map((r) => (
                  <li key={r.id} className="grid gap-3 py-4">
                    <RegionRow
                      regionId={r.id}
                      name={r.name}
                      chapters={`${plural(r.chapters, "chapter")} · ${plural(r.members, "member")}`}
                      coordinatorName={r.coordinatorName}
                      coordinatorEmail={r.coordinatorEmail}
                      coordinatorPhone={r.coordinatorPhone}
                    />
                    {!r.coordinatorName && (
                      <details className="rounded-[var(--radius-md)] border border-line bg-cream/40">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-earth-700">Appoint a Regional Coordinator</summary>
                        <div className="border-t border-line p-4">
                          <AppointCoordinatorForm regionId={r.id} regionName={r.name} candidates={r.candidates} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      )}

      <section aria-labelledby="chapters-title" className="grid gap-4">
        {regions && (
          <h2 id="chapters-title" className="font-display text-2xl text-forest-900">
            Chapters
          </h2>
        )}
        {data.regions.length > 0 && (
          <AddPanel title="Create a chapter" hint="With its President and Financial Secretary.">
            <CreateChapterForm
              regions={data.regions}
              presidentCandidates={data.presidentCandidates}
              excoRoles={INITIAL_EXCO_ROLES.filter((key) => key !== "CHAPTER_PRESIDENT" && key !== "FINANCIAL_SECRETARY").map((key) => ({ key, name: roleName(key) }))}
            />
          </AddPanel>
        )}

        <Panel title={regions ? undefined : "All chapters"} bodyClassName="overflow-x-auto">
          {data.chapters.length === 0 ? (
            <p className="text-sm text-ink-500">No chapters yet.</p>
          ) : (
            <table className={t.table}>
              <thead>
                <tr>
                  <th scope="col" className={t.th}>Chapter</th>
                  <th scope="col" className={`${t.th} hidden md:table-cell`}>Region</th>
                  <th scope="col" className={t.th}>Chapter President</th>
                  <th scope="col" className={t.th}>Phone</th>
                  <th scope="col" className={t.th}>Email</th>
                  <th scope="col" className={`${t.th} text-right`}>Members</th>
                </tr>
              </thead>
              <tbody>
                {data.chapters.map((c) => (
                  <tr key={c.id}>
                    <td className={t.td}>
                      <span className="font-medium text-ink-900">{c.name}</span>
                      <span className="block text-xs text-ink-500">{c.location}</span>
                      {c.canEdit && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-earth-700">Edit chapter</summary>
                          <div className="mt-3 min-w-[16rem] rounded-[var(--radius-md)] border border-line bg-paper p-4">
                            <EditChapterForm chapterId={c.id} name={c.name} location={c.location} />
                          </div>
                        </details>
                      )}
                    </td>
                    <td className={`${t.td} hidden md:table-cell`}>{c.regionName ?? <span className="text-ink-500">Reports directly</span>}</td>
                    <td className={t.td}>{c.presidentName ?? <Pill tone="earth">Vacant</Pill>}</td>
                    <td className={`${t.td} whitespace-nowrap`}>
                      {c.presidentPhone ? (
                        <a href={`tel:${c.presidentPhone.replace(/\s+/g, "")}`} className="num text-earth-700 underline-offset-4 hover:underline">
                          {c.presidentPhone}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-500">{c.presidentName ? "Not provided" : "—"}</span>
                      )}
                    </td>
                    <td className={t.td}>
                      {c.presidentEmail ? (
                        <a href={`mailto:${c.presidentEmail}`} className="break-all text-earth-700 underline-offset-4 hover:underline">
                          {c.presidentEmail}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-500">—</span>
                      )}
                    </td>
                    <td className={`${t.td} num text-right`}>{plural(c.members, "member")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </section>
    </div>
  );
}
