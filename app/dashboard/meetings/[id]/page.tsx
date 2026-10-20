import { ExportLink, PrintButton } from "@/components/portal/PageTools";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceForm, CompleteActionButton } from "@/components/portal/forms";
import { CancelMeetingForm, DecisionForm, EditMeetingForm, MarkHeldButton, MeetingDocumentForm, MinutesForm } from "@/components/portal/MeetingForms";
import { ActionPill, AttendancePill, EmptyState, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";
import { site } from "@/lib/content/site";
import { getMeeting } from "@/lib/portal/queries";
import { formatDate, formatFileSize, formatDateLong, formatDateTime, formatTime, ORG_TIME_ZONE_LABEL } from "@/lib/utils";

export async function generateMetadata() {
  return { title: "Meeting" };
}

export default async function MeetingPage({ params }: PageProps<"/dashboard/meetings/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  const data = getMeeting(actor, id);
  // Not visible and not existing look the same — no information leaks.
  if (!data) notFound();

  const { meeting, minutes, decisions, attendance, documents, outstanding } = data;
  const now = new Date().toISOString();
  const cancelled = meeting.status === "cancelled";
  const held = !cancelled && (meeting.status === "held" || meeting.startsAt < now);
  // The edit form works in West Africa Time (UTC+1).
  const watLocal = (iso: string) => new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 16);
  const recorded = new Map(attendance.map((a) => [a.memberId, a.status]));
  const pageUrl = `${site.url}/dashboard/meetings/${meeting.id}`;
  const calendarLink = "inline-flex items-center rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-sm font-medium text-forest-900 transition-colors hover:border-forest-700/40 hover:bg-cream/60";

  return (
    <div className="grid gap-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/dashboard/meetings" className="text-sm text-ink-500 hover:text-forest-900">
            ← All meetings
          </Link>
          <PrintButton label={held ? "Print minutes & attendance" : "Print"} />
        </div>
        <div className="mt-5 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={meeting.status === "scheduled" ? "gold" : meeting.status === "held" ? "green" : "earth"}>
                {meeting.status === "scheduled" ? "Scheduled" : meeting.status === "held" ? "Held" : meeting.notHeld ? "Not held" : "Cancelled"}
              </Pill>
              <Pill>{data.scopeLabel}</Pill>
              <Pill tone="gold">{data.audienceLabel}</Pill>
            </div>
            <h1 className="display mt-4 text-[clamp(1.875rem,3.2vw,2.75rem)] text-forest-900">{meeting.title}</h1>
            <p className="mt-2 text-sm text-ink-500">
              Scheduled by {data.createdByName} · for {data.inviteeCount} {data.inviteeCount === 1 ? "person" : "people"}
              {data.selectedNames && `: ${data.selectedNames.join(", ")}`}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-1 lg:text-right">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Date</dt>
              <dd className="mt-0.5 font-medium text-ink-900">{formatDateLong(meeting.startsAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Time</dt>
              <dd className="mt-0.5 font-medium text-ink-900">
                {formatTime(meeting.startsAt)}
                {meeting.endsAt && `–${formatTime(meeting.endsAt)}`} {ORG_TIME_ZONE_LABEL}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Location</dt>
              <dd className="mt-0.5 font-medium text-ink-900">{meeting.location}</dd>
            </div>
          </dl>
        </div>
        {/* Add to calendar: upcoming meetings only. */}
        {!cancelled && !held && (
          <div className="mt-5 flex flex-wrap items-center gap-2 print:hidden">
            <span className="mr-1 text-xs uppercase tracking-[0.12em] text-ink-500">Add to calendar</span>
            <a href={googleCalendarUrl(meeting, pageUrl)} target="_blank" rel="noopener noreferrer" className={calendarLink}>
              Google Calendar
            </a>
            <a href={outlookCalendarUrl(meeting, pageUrl)} target="_blank" rel="noopener noreferrer" className={calendarLink}>
              Outlook
            </a>
            <a href={`/dashboard/meetings/${meeting.id}/calendar`} download className={calendarLink}>
              Apple / phone (.ics file)
            </a>
          </div>
        )}
      </div>

      {cancelled && (
        <Panel tone="cream">
          <p className="text-sm text-ink-700">
            <span className="font-semibold text-earth-800">{meeting.notHeld ? "Not held." : "Cancelled."}</span> {meeting.cancelReason}
          </p>
        </Panel>
      )}

      {data.canEdit && (
        <Panel title="Manage this meeting" tone="cream" className="print:hidden">
          <div className="grid gap-4">
            {data.canMarkHeld && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-700">Did it take place?</p>
                <MarkHeldButton meetingId={meeting.id} />
              </div>
            )}
            {!held && (
            <details className="rounded-[var(--radius-md)] border border-line bg-paper">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-earth-700">Change date, place or agenda</summary>
              <div className="border-t border-line p-4">
                <EditMeetingForm
                  meetingId={meeting.id}
                  initial={{
                    title: meeting.title,
                    startsAt: watLocal(meeting.startsAt),
                    endsAt: meeting.endsAt ? watLocal(meeting.endsAt).slice(11) : "",
                    location: meeting.location,
                    agenda: meeting.agenda.join("\n"),
                  }}
                />
              </div>
            </details>
            )}
            <details className="rounded-[var(--radius-md)] border border-line bg-paper">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-earth-700">{held ? "Mark not held" : "Cancel this meeting"}</summary>
              <div className="border-t border-line p-4">
                <CancelMeetingForm meetingId={meeting.id} notHeld={held} />
              </div>
            </details>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-8">
          {/* Agenda */}
          <Panel title="Agenda">
            {meeting.agenda.length === 0 ? (
              <EmptyState compact title="No agenda published" />
            ) : (
              <ol className="grid gap-3">
                {meeting.agenda.map((item, i) => (
                  <li key={item} className="flex gap-4">
                    <span className="num w-6 shrink-0 font-display text-lg text-earth-600">{i + 1}</span>
                    <span className="pt-0.5 text-ink-700">{item}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* Outstanding action items from earlier meetings */}
          {outstanding.length > 0 && (
            <Panel title="Carried forward" tone="cream" action={<span className="text-xs text-ink-500">Open items from earlier meetings</span>}>
              <ul className="grid gap-3">
                {outstanding.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 text-sm">
                    <span>
                      <span className="font-medium text-ink-900">{a.title}</span>
                      <span className="block text-xs text-ink-500">
                        {a.assigneeName} · due {formatDate(a.dueDate)}
                        <Contact contact={contactFor(actor, a.assigneeId)} />
                      </span>
                    </span>
                    <ActionPill status={a.status} overdue={a.dueDate < now} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Minutes */}
          {held && (
            <Panel
              title="Minutes"
              action={minutes ? <Pill tone={minutes.status === "published" ? "green" : "gold"}>{minutes.status === "published" ? `Published ${formatDate(minutes.publishedAt!)}` : "Draft — officers only"}</Pill> : undefined}
            >
              {data.canWriteMinutes ? (
                <>
                  <div className="print:hidden">
                    <MinutesForm meetingId={meeting.id} canPublish={data.canPublishMinutes} initial={data.draftMinutes} />
                  </div>
                  <div className="hidden print:block">{minutes ? <MinutesText minutes={minutes} /> : <p className="text-sm">No minutes written yet.</p>}</div>
                </>
              ) : !minutes ? (
                <EmptyState compact title="Minutes not yet published"></EmptyState>
              ) : (
                <MinutesText minutes={minutes} />
              )}
            </Panel>
          )}

          {/* Decisions → actions */}
          {held && (
            <Panel title="Decisions & actions">
              {data.canDecide && (
                <div className="mb-6 border-b border-line pb-6 print:hidden">
                  <DecisionForm meetingId={meeting.id} canAssign={data.canAssign} assignees={data.assignees} />
                </div>
              )}
              {decisions.length === 0 ? (
                <EmptyState compact title="No decisions recorded" />
              ) : (
                <ol className="grid gap-6">
                  {decisions.map((d, i) => (
                    <li key={d.id} className="rounded-[var(--radius-md)] border border-line bg-paper p-5">
                      <p className="flex gap-3 font-display text-lg leading-snug text-forest-900">
                        <span className="num text-earth-600">D{i + 1}</span>
                        {d.text}
                      </p>
                      {d.actions.length > 0 ? (
                        <ul className="mt-4 grid gap-3 border-t border-line pt-4">
                          {d.actions.map((a) => (
                            <li key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-ink-900">{a.title}</p>
                                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                                  <span>
                                    Responsible: {a.assigneeName}
                                    <Contact contact={contactFor(actor, a.assigneeId)} />
                                  </span>
                                  <span aria-hidden>·</span>
                                  <span>Due {formatDate(a.dueDate)}</span>
                                  <ActionPill status={a.status} overdue={a.dueDate < now} />
                                </p>
                              </div>
                              {a.canComplete && (
                                <div className="print:hidden">
                                  <CompleteActionButton id={a.id} />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-xs text-ink-500">No action items attached.</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>

        <div className="grid content-start gap-6 lg:col-span-4">
          {/* Attendance */}
          <Panel title="Attendance" action={held && data.seeFullAttendance ? <ExportLink kind="attendance" query={{ meeting: meeting.id }} label="Spreadsheet" /> : undefined}>
            {cancelled ? (
              <EmptyState compact title={meeting.notHeld ? "Not held" : "Meeting cancelled"} />
            ) : !held ? (
              <EmptyState compact title="Not yet recorded">Attendance is recorded at the meeting.</EmptyState>
            ) : data.canRecordAttendance && data.roll.length > 0 ? (
              <>
                <div className="print:hidden">
                  <AttendanceForm meetingId={meeting.id} roll={data.roll.map((m) => ({ id: m.id, fullName: m.fullName, status: recorded.get(m.id) }))} />
                </div>
                <ul className="hidden gap-1 text-sm print:grid">
                  {data.roll.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3 border-b border-line py-1">
                      <span>{m.fullName}</span>
                      <span>{STATUS_LABEL[recorded.get(m.id) ?? "none"]}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : attendance.length === 0 ? (
              <EmptyState compact title="No attendance recorded" />
            ) : (
              <>
                {!data.seeFullAttendance && <p className="mb-3 text-xs text-ink-500">Your own attendance record:</p>}
                <ul className="grid gap-2">
                  {attendance.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-900">
                        {a.memberName}
                        <Contact contact={contactFor(actor, a.memberId)} />
                      </span>
                      <AttendancePill status={a.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          {/* Documents */}
          <Panel title="Documents">
            {documents.length === 0 ? (
              <EmptyState compact title="No documents yet">{data.canAddDocument ? "Add the agenda pack, reports or signed minutes below." : "Papers for this meeting will appear here."}</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {documents.map((d) => (
                  <li key={d.id} className="text-sm">
                    {d.canDownload ? (
                      <a href={`/dashboard/public-relations/${d.id}/download`} className="font-medium text-forest-900 underline-offset-4 hover:text-earth-700 hover:underline">
                        {d.title}
                      </a>
                    ) : (
                      <span className="font-medium text-ink-700">{d.title}</span>
                    )}
                    <span className="block text-xs text-ink-500">{formatFileSize(d.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.canAddDocument && (
              <details className="mt-5 border-t border-line pt-4 print:hidden">
                <summary className="cursor-pointer text-sm font-semibold text-forest-900">Add a document</summary>
                <div className="mt-4">
                  <MeetingDocumentForm meetingId={meeting.id} />
                </div>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { present: "Present", late: "Late", excused: "Excused", absent: "Absent", none: "Not recorded" } as const;

type MinutesRecord = NonNullable<NonNullable<ReturnType<typeof getMeeting>>["minutes"]>;

/** The minutes as read (and printed). */
function MinutesText({ minutes }: { minutes: MinutesRecord }) {
  return (
    <div className="grid gap-6">
      <p className="prose-ncuda text-[0.9375rem]">{minutes.discussion}</p>
      {minutes.keyIssues.length > 0 && (
        <div>
          <h3 className="eyebrow text-[0.6875rem] text-ink-500">Key issues</h3>
          <ul className="mt-3 grid gap-2 text-sm text-ink-700">
            {minutes.keyIssues.map((k) => (
              <li key={k} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-gold-500" />
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {minutes.resolutions.length > 0 && (
        <div>
          <h3 className="eyebrow text-[0.6875rem] text-ink-500">Resolutions</h3>
          <ol className="mt-3 grid gap-2 text-sm text-ink-700">
            {minutes.resolutions.map((r, i) => (
              <li key={r} className="flex gap-3">
                <span className="num text-earth-600">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-xs text-ink-500">Last updated {formatDateTime(minutes.updatedAt)}</p>
    </div>
  );
}
