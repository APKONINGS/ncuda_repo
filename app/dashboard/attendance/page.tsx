import { ExportLink, PrintButton } from "@/components/portal/PageTools";
import Link from "next/link";
import { AttendancePill, EmptyState, PageHeader, Panel, Stat, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { attendanceRegister, myAttendance } from "@/lib/portal/queries";
import { scopeLabel } from "@/lib/portal/visibility";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const actor = await requireActor();
  const mine = myAttendance(actor);
  const register = attendanceRegister(actor);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Attendance"
        title="Attendance"
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <Panel className="sm:col-span-2 lg:col-span-1">
          <Stat label="Attendance rate" value={mine.rate === null ? "—" : `${mine.rate}%`} hint="Present or late" />
        </Panel>
        {(["present", "late", "excused", "absent"] as const).map((s) => (
          <Panel key={s}>
            <Stat label={s} value={mine.counts[s]} />
          </Panel>
        ))}
      </div>

      <Panel title="Your record" bodyClassName="overflow-x-auto">
        {mine.rows.length === 0 ? (
          <EmptyState title="No attendance recorded yet"></EmptyState>
        ) : (
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Date</th>
                <th scope="col" className={t.th}>Meeting</th>
                <th scope="col" className={`${t.th} hidden md:table-cell`}>Scope</th>
                <th scope="col" className={`${t.th} text-right`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mine.rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${t.td} num whitespace-nowrap`}>{formatDate(r.meeting.startsAt)}</td>
                  <td className={t.td}>
                    <Link href={`/dashboard/meetings/${r.meetingId}`} className="font-medium text-ink-900 hover:text-earth-700">
                      {r.meeting.title}
                    </Link>
                  </td>
                  <td className={`${t.td} hidden md:table-cell`}>{scopeLabel(r.meeting.scope)}</td>
                  <td className={`${t.td} text-right`}>
                    <AttendancePill status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {register && (
        <section aria-labelledby="register" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="register" className="font-display text-2xl text-forest-900">
                Attendance register
              </h2>
              <p className="mt-1 text-sm text-ink-500">Past meetings</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportLink kind="attendance" />
              <PrintButton />
            </div>
          </div>
          {(
            [
              ["chapter", "Chapter meetings"],
              ["region", "Regional meetings"],
              ["organization", "National meetings"],
            ] as const
          ).map(([level, label]) => {
            const rows = register.meetings.filter((r) => r.meeting.scope.level === level);
            const unrecorded = rows.filter((r) => r.recorded === 0).length;
            return (
              <details key={level} open={rows.length > 0} data-print-open className="group rounded-[var(--radius-lg)] border border-line bg-paper">
                <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block font-display text-lg text-forest-900">{label}</span>
                    <span className="text-sm text-ink-500">
                      {rows.length} {rows.length === 1 ? "meeting" : "meetings"}
                      {unrecorded > 0 && ` · ${unrecorded} not recorded yet`}
                    </span>
                  </span>
                  <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45 print:hidden">
                    +
                  </span>
                </summary>
                <div className="overflow-x-auto border-t border-line">
                  {rows.length === 0 ? (
                    <p className="px-6 py-5 text-sm text-ink-500">No past meetings.</p>
                  ) : (
                    <table className={t.table}>
                      <thead>
                        <tr>
                          <th scope="col" className={t.th}>Date</th>
                          <th scope="col" className={t.th}>Meeting</th>
                          {level !== "organization" && (
                            <th scope="col" className={`${t.th} hidden md:table-cell`}>{level === "chapter" ? "Chapter" : "Region"}</th>
                          )}
                          <th scope="col" className={`${t.th} text-right`}>Present</th>
                          <th scope="col" className={`${t.th} text-right print:hidden`}><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.meeting.id}>
                            <td className={`${t.td} num whitespace-nowrap`}>{formatDate(r.meeting.startsAt)}</td>
                            <td className={t.td}>{r.meeting.title}</td>
                            {level !== "organization" && <td className={`${t.td} hidden md:table-cell`}>{r.where}</td>}
                            <td className={`${t.td} num text-right whitespace-nowrap`}>
                              {r.recorded === 0 ? (
                                <span className="text-earth-700">Not recorded</span>
                              ) : (
                                <>
                                  {r.present} / {r.invited}
                                </>
                              )}
                            </td>
                            <td className={`${t.td} text-right print:hidden`}>
                              <Link href={`/dashboard/meetings/${r.meeting.id}`} className="text-sm text-earth-700 hover:underline">
                                {r.canRecord ? (r.recorded === 0 ? "Record" : "Review / update") : "Review"}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
