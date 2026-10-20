import Link from "next/link";
import { notFound } from "next/navigation";
import { CommitteeDocumentForm, CommitteeMeetingStatusForm, CommitteeMinutesForm } from "@/components/portal/CommitteeForms";
import { AttendanceForm } from "@/components/portal/forms";
import { AttendancePill, EmptyState, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { getCommitteeMeeting } from "@/lib/portal/committees";
import { formatDate, formatDateLong, formatDateTime, formatFileSize, formatTime, ORG_TIME_ZONE_LABEL } from "@/lib/utils";

export const metadata = { title: "Committee meeting" };

export default async function CommitteeMeetingPage({ params }: PageProps<"/dashboard/committees/[id]/meetings/[meetingId]">) {
  const { id, meetingId } = await params;
  const actor = await requireActor();
  const data = getCommitteeMeeting(actor, id, meetingId);
  // Not visible and not existing look the same — no information leaks.
  if (!data) notFound();
  const { committee, meeting, minutes, roll, documents } = data;
  const recorded = roll.filter((r) => r.status);

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/dashboard/committees/${committee.id}`} className="text-sm text-ink-500 hover:text-forest-900">
          ← {committee.name}
        </Link>
        <div className="mt-5 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={meeting.status === "scheduled" ? "gold" : meeting.status === "held" ? "green" : "earth"}>
                {meeting.status === "scheduled" ? "Scheduled" : meeting.status === "held" ? "Held" : "Cancelled"}
              </Pill>
              <Pill>Committee meeting</Pill>
            </div>
            <h1 className="display mt-4 text-[clamp(1.875rem,3.2vw,2.75rem)] text-forest-900">{meeting.title}</h1>
            <p className="mt-2 text-sm text-ink-500">Scheduled by {meeting.createdByName}</p>
            <Contact contact={contactFor(actor, meeting.createdBy)} />
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-1 lg:text-right">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Date</dt>
              <dd className="mt-0.5 font-medium text-ink-900">{formatDateLong(meeting.startsAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Time</dt>
              <dd className="mt-0.5 font-medium text-ink-900">
                {formatTime(meeting.startsAt)} {ORG_TIME_ZONE_LABEL}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">Location</dt>
              <dd className="mt-0.5 font-medium text-ink-900">{meeting.location}</dd>
            </div>
          </dl>
        </div>
      </div>

      {data.canChangeStatus && (
        <Panel tone="cream">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CommitteeMeetingStatusForm meetingId={meeting.id} />
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-8">
          <Panel title="Agenda">
            {meeting.agenda.length === 0 ? (
              <EmptyState compact title="No agenda published" />
            ) : (
              <ol className="grid gap-3">
                {meeting.agenda.map((item, i) => (
                  <li key={`${i}-${item}`} className="flex gap-4">
                    <span className="num w-6 shrink-0 font-display text-lg text-earth-600">{i + 1}</span>
                    <span className="pt-0.5 text-ink-700">{item}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {meeting.status !== "cancelled" && (
            <Panel
              title="Minutes"
              action={minutes ? <Pill tone={minutes.status === "published" ? "green" : "gold"}>{minutes.status === "published" ? `Published ${formatDate(minutes.publishedAt!)}` : "Draft — Secretary, President and Vice President only"}</Pill> : undefined}
            >
              {data.canWriteMinutes ? (
                <CommitteeMinutesForm meetingId={meeting.id} text={minutes?.text} decisions={minutes?.decisions} />
              ) : !minutes ? (
                <EmptyState compact title="Minutes not yet published"></EmptyState>
              ) : (
                <div className="grid gap-6">
                  <p className="prose-ncuda whitespace-pre-line text-[0.9375rem]">{minutes.text}</p>
                  {minutes.decisions.length > 0 && (
                    <div>
                      <h3 className="eyebrow text-[0.6875rem] text-ink-500">Decisions</h3>
                      <ol className="mt-3 grid gap-2 text-sm text-ink-700">
                        {minutes.decisions.map((d, i) => (
                          <li key={`${i}-${d}`} className="flex gap-3">
                            <span className="num text-earth-600">{i + 1}.</span>
                            {d}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <p className="text-xs text-ink-500">
                    Recorded by {minutes.recordedByName} · last updated {formatDateTime(minutes.updatedAt)}
                    <Contact contact={contactFor(actor, minutes.recordedBy)} />
                  </p>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="grid content-start gap-6 lg:col-span-4">
          <Panel title="Attendance">
            {data.canRecordAttendance && roll.length > 0 ? (
              <AttendanceForm committee meetingId={meeting.id} roll={roll.map((m) => ({ id: m.id, fullName: m.fullName, status: m.status ?? undefined }))} />
            ) : recorded.length === 0 ? (
              <EmptyState compact title="No attendance recorded" />
            ) : (
              <ul className="grid gap-2">
                {recorded.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-900">
                      {a.fullName}
                      <Contact contact={contactFor(actor, a.id)} />
                    </span>
                    <AttendancePill status={a.status!} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Documents">
            {documents.length === 0 ? (
              <EmptyState compact title="No documents for this meeting" />
            ) : (
              <ul className="grid gap-3">
                {documents.map((d) => (
                  <li key={d.id} className="text-sm">
                    <a href={`/dashboard/public-relations/${d.id}/download`} className="font-medium text-forest-900 underline-offset-4 hover:text-earth-700 hover:underline">
                      {d.title}
                    </a>
                    <span className="block text-xs text-ink-500">
                      {d.uploadedByName} · {formatFileSize(d.sizeBytes)}
                      <Contact contact={contactFor(actor, d.uploadedBy)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.canUpload && (
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-forest-900">Add a document</summary>
                <div className="mt-4">
                  <CommitteeDocumentForm committeeId={committee.id} meetingId={meeting.id} />
                </div>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
