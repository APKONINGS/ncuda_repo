import Link from "next/link";
import { ContourField } from "@/components/brand/Motifs";
import { NotificationInbox } from "@/components/portal/NotificationInbox";
import { ActionPill, AttendancePill, DateBlock, EmptyState, Panel, PanelLink, Pill, Stat } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import type { Actor } from "@/lib/permissions/engine";
import { registrationStanding } from "@/lib/portal/registration";
import { hasAnywhere } from "@/lib/permissions/engine";
import { roleName } from "@/lib/permissions/roles";
import {
  chapterName,
  listAudit,
  listDocuments,
  listMeetings,
  listMembers,
  listNotifications,
  messagingOptions,
  myActionItems,
  myAttendance,
  registrationToCollect,
  scopedOpenActionItems,
  transferOptions,
} from "@/lib/portal/queries";
import { TransferMemberForm } from "@/components/portal/OrgEditForms";
import { scopeLabel } from "@/lib/portal/visibility";
import { formatDate, formatDateLong, formatDateTime, formatMoney, formatTime, ORG_TIME_ZONE_LABEL, plural } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const actor = await requireActor({ allowInactive: true });
  if (actor.inactive) return <InactiveOverview actor={actor} />;
  const now = new Date().toISOString();

  const meetings = listMeetings(actor);
  const next = meetings.upcoming[0];
  const actions = myActionItems(actor);
  const attendance = myAttendance(actor);
  const notifications = listNotifications(actor);
  const unread = notifications.filter((n) => !n.read);
  const documents = listDocuments(actor).slice(0, 4);

  // Officer widgets — each appears only if the actor holds the permission.
  const openActions = scopedOpenActionItems(actor);
  const members = listMembers(actor);
  const audit = listAudit(actor, 5);
  const isOfficer = actor.roles.length > 0;
  const collect = registrationToCollect(actor);

  return (
    <div className="grid gap-8">
      {collect && collect.people.length > 0 && (
        <Panel tone="cream">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">
              <span className="font-medium text-ink-900">Registration {collect.year}:</span> {collect.people.length} still to collect in your chapter.
            </p>
            <PanelLink href="/dashboard/registration">Go to Registration →</PanelLink>
          </div>
        </Panel>
      )}

      {/* Greeting */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-ink-500">{formatDateLong(now)}</p>
          <h1 className="display mt-2 text-[clamp(2rem,3.6vw,3rem)] text-forest-900">
            Welcome, <span className="display-italic text-earth-700">{actor.member.fullName}</span>
          </h1>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Your roles">
          {actor.roles.length === 0 && <li><Pill>Member · {chapterName(actor.chapterId)}</Pill></li>}
          {actor.roles.map((r) => (
            <li key={r.assignment.id}>
              <Pill tone="dark">
                {r.role.name} · {scopeLabel(r.assignment.scope)}
              </Pill>
            </li>
          ))}
        </ul>
      </div>

      {/* Row 1 */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section data-surface="dark" aria-labelledby="next-meeting" className="on-dark relative overflow-hidden rounded-[var(--radius-lg)] bg-forest-900 p-6 text-paper sm:p-8 lg:col-span-7">
          <ContourField className="absolute inset-0 h-full w-full text-forest-700/60" lines={10} seed={8} />
          <div className="relative">
            <h2 id="next-meeting" className="eyebrow text-gold-300">Next meeting</h2>
            {next ? (
              <>
                <p className="mt-5 font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-tight">{formatDateLong(next.startsAt)}</p>
                <p className="mt-2 text-paper/70">
                  {formatTime(next.startsAt)} {ORG_TIME_ZONE_LABEL} · {next.location}
                </p>
                <p className="mt-6 text-lg">{next.title}</p>
                <p className="mt-1 text-sm text-paper/55">{scopeLabel(next.scope)}</p>
                {next.agenda.length > 0 && (
                  <ol className="mt-6 grid gap-1.5 border-t border-paper/15 pt-5 text-sm text-paper/75">
                    {next.agenda.slice(0, 4).map((item, i) => (
                      <li key={item} className="flex gap-3">
                        <span className="num text-gold-300">{String(i + 1).padStart(2, "0")}</span>
                        {item}
                      </li>
                    ))}
                  </ol>
                )}
                <Link href={`/dashboard/meetings/${next.id}`} className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-paper px-4 py-2.5 text-sm font-medium text-forest-900 hover:bg-cream">
                  View meeting
                </Link>
              </>
            ) : (
              <p className="mt-6 max-w-md text-paper/75">No upcoming meetings.</p>
            )}
          </div>
        </section>

        <Panel title="Your action items" className="lg:col-span-5" action={<span className="num text-sm text-ink-500">{actions.length} open</span>}>
          {actions.length === 0 ? (
            <EmptyState compact title="Nothing assigned to you"></EmptyState>
          ) : (
            <ul className="grid gap-4">
              {actions.map((a) => (
                <li key={a.id} className="flex gap-4">
                  <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rotate-45 bg-earth-600" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/meetings/${a.meetingId}`} className="font-medium text-ink-900 hover:text-earth-700">
                      {a.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      Due {formatDate(a.dueDate)} <ActionPill status={a.status} overdue={a.dueDate < now} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Row 2 */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Attendance" action={<PanelLink href="/dashboard/attendance">History</PanelLink>}>
          {attendance.rows.length === 0 ? (
            <EmptyState compact title="No attendance yet" />
          ) : (
            <>
              <Stat label="Attended" value={`${attendance.rate}%`} hint={plural(attendance.rows.length, "recorded meeting")} />
              <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-bone" aria-hidden>
                {(["present", "late", "excused", "absent"] as const).map((s) => (
                  <span
                    key={s}
                    style={{ width: `${(attendance.counts[s] / attendance.rows.length) * 100}%` }}
                    className={{ present: "bg-forest-600", late: "bg-gold-500", excused: "bg-ink-300", absent: "bg-earth-500" }[s]}
                  />
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-xs">
                {(["present", "late", "excused", "absent"] as const).map((s) => (
                  <div key={s}>
                    <dt className="capitalize text-ink-500">{s}</dt>
                    <dd className="num font-medium text-ink-900">{attendance.counts[s]}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Panel>

        <Panel title="Finances" action={<PanelLink href="/dashboard/finances">Open</PanelLink>}>
          <div className="flex items-start gap-4">
            <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-forest-800">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <rect x="2.5" y="7" width="11" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </span>
            <p className="text-sm leading-relaxed text-ink-700">
              Private until you open them.
            </p>
          </div>
          <Link href="/dashboard/finances" className="mt-5 inline-flex rounded-[var(--radius-sm)] border border-line-strong px-4 py-2 text-sm font-medium text-forest-900 hover:border-forest-800">
            Open Finances
          </Link>
        </Panel>

        <Panel title="Notifications" className="md:col-span-2 xl:col-span-1" action={<PanelLink href="/dashboard/notifications">{unread.length} unread</PanelLink>}>
          {notifications.length === 0 ? (
            <EmptyState compact title="No notifications" />
          ) : (
            <NotificationInbox
              compact
              items={notifications.slice(0, 4).map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                createdAt: n.createdAt,
                audienceLabel: n.audienceLabel,
                senderName: n.senderName,
                link: n.link,
                read: n.read,
                canForward: n.canForward,
                forwardInfo: n.forwardInfo,
              attachments: n.attachments,
              }))}
              forwardOptions={messagingOptions(actor)}
            />
          )}
        </Panel>
      </div>

      {/* Row 3 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent meetings" action={<PanelLink href="/dashboard/meetings">All meetings</PanelLink>}>
          {meetings.past.length === 0 ? (
            <EmptyState compact title="No past meetings" />
          ) : (
            <ul className="grid gap-4">
              {meetings.past.slice(0, 3).map((m) => {
                const mine = attendance.rows.find((r) => r.meetingId === m.id);
                return (
                  <li key={m.id}>
                    <Link href={`/dashboard/meetings/${m.id}`} className="group flex items-center gap-4">
                      <DateBlock iso={m.startsAt} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900 group-hover:text-earth-700">{m.title}</span>
                        <span className="block text-xs text-ink-500">{scopeLabel(m.scope)}</span>
                      </span>
                      {mine && <AttendancePill status={mine.status} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Public Relations" action={<PanelLink href="/dashboard/public-relations">View all</PanelLink>}>
          {documents.length === 0 ? (
            <EmptyState compact title="No documents yet" />
          ) : (
            <ul className="divide-y divide-line">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">{d.title}</span>
                    <span className="text-xs text-ink-500">{d.scopeLabel} · {formatDate(d.uploadedAt)}</span>
                  </span>
                  <Pill>{d.category}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Officer band */}
      {isOfficer && (openActions || members || audit) && (
        <section aria-labelledby="responsibilities" className="mt-4">
          <div className="flex items-end justify-between border-b border-line pb-4">
            <div>
              <p className="eyebrow text-earth-700">Your responsibilities</p>
              <h2 id="responsibilities" className="display mt-2 text-3xl text-forest-900">
                As {actor.roles.map((r) => roleName(r.role.key)).join(" & ")}
              </h2>
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {openActions && (
              <Panel title="Open action items in your scope" tone="cream">
                {openActions.length === 0 ? (
                  <EmptyState compact title="All action items are complete" />
                ) : (
                  <ul className="grid gap-3">
                    {openActions.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-4 text-sm">
                        <span>
                          <Link href={`/dashboard/meetings/${a.meetingId}`} className="font-medium text-ink-900 hover:text-earth-700">{a.title}</Link>
                          <span className="block text-xs text-ink-500">{a.assigneeName} · due {formatDate(a.dueDate)}</span>
                        </span>
                        <ActionPill status={a.status} overdue={a.dueDate < now} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {members && (
              <Panel title="Members in your scope" tone="cream" action={<PanelLink href="/dashboard/members">Manage</PanelLink>}>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Total" value={members.rows.length} />
                  <Stat label="Active" value={members.rows.filter((m) => m.status === "active").length} />
                  <Stat label="Chapters" value={members.chapterIds.length} />
                </div>
              </Panel>
            )}
            {audit && (
              <Panel title="Recent activity" tone="cream" action={<PanelLink href="/dashboard/audit-log">Audit log</PanelLink>}>
                {audit.length === 0 ? (
                  <EmptyState compact title="No recorded activity" />
                ) : (
                  <ul className="grid gap-3 text-sm">
                    {audit.map((e) => (
                      <li key={e.id}>
                        <p className="text-ink-900">{e.summary}</p>
                        <p className="text-xs text-ink-500">{e.actorName} · {formatDateTime(e.at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * What an inactive member sees: the steps to become active — belong to a
 * chapter, and pay its registration fee to its Financial Secretary — and the
 * setup work their office still allows while unpaid.
 */
function InactiveOverview({ actor }: { actor: Actor }) {
  const standing = registrationStanding(actor.member.id);
  const collect = registrationToCollect(actor);
  const join = actor.chapterId ? null : transferOptions(actor, actor.member.id);
  const setup = [
    hasAnywhere(actor, "CREATE_REGION") && { href: "/dashboard/chapters", label: "Create regions" },
    hasAnywhere(actor, "CREATE_CHAPTER") && { href: "/dashboard/chapters", label: "Create chapters" },
    hasAnywhere(actor, "CREATE_MEMBER") && { href: "/dashboard/registration", label: "Registration" },
    hasAnywhere(actor, "MANAGE_REGISTRATION") && { href: "/dashboard/registration", label: "Registration overview" },
  ].filter((x): x is { href: string; label: string } => !!x);
  const noChapters =
    hasAnywhere(actor, "CREATE_REGION")
      ? "No chapters yet."
      : hasAnywhere(actor, "CREATE_CHAPTER")
        ? "No chapters in your region yet."
        : "No chapter to join yet.";
  return (
    <div className="grid gap-8">
      <section className="rounded-[var(--radius-xl)] border border-earth-500/30 bg-earth-100/50 p-6 sm:p-8">
        <p className="eyebrow text-earth-700">Registration {standing.year}</p>
        <h1 className="mt-3 font-display text-3xl text-forest-900">Your account is inactive</h1>
        <p className="mt-3 max-w-2xl text-ink-700">
          Join a chapter and pay its registration fee to become active.
        </p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          <li className="rounded-[var(--radius-md)] border border-line bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-ink-500">1 · Your chapter</p>
            {actor.chapterId ? (
              <p className="mt-1 font-medium text-ink-900">{chapterName(actor.chapterId)}</p>
            ) : join ? (
              <div className="mt-2">
                {actor.mustJoinChapter && (
                  <p className="mb-3 text-sm font-medium text-earth-800">
                    Join your chapter first.
                  </p>
                )}
                <TransferMemberForm memberId={actor.member.id} memberName="You" placing destinations={join.destinations} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-700">{noChapters}</p>
            )}
          </li>
          <li className="rounded-[var(--radius-md)] border border-line bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-ink-500">2 · Pay your registration</p>
            {!actor.chapterId ? (
              <p className="mt-1 text-sm text-ink-700">Join a chapter first.</p>
            ) : standing.fee ? (
              <p className="mt-1 text-sm text-ink-700">
                <span className="num font-display text-2xl text-forest-900">{formatMoney(standing.fee)}</span>
                <span className="block">to the Financial Secretary of {chapterName(actor.chapterId)}.</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-700">{chapterName(actor.chapterId)}&apos;s Financial Secretary has not set the registration amount yet.</p>
            )}
          </li>
        </ol>
      </section>
      {collect && collect.people.length > 0 && (
        <Panel tone="cream">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">
              <span className="font-medium text-ink-900">Registration {collect.year}:</span> {collect.people.length} still to collect in your chapter.
            </p>
            <PanelLink href="/dashboard/registration">Go to Registration →</PanelLink>
          </div>
        </Panel>
      )}
      {setup.length > 0 && (
        <Panel title="What you can do meanwhile" tone="cream">
          <ul className="grid gap-2">
            {setup.map((s) => (
              <li key={s.label}>
                <PanelLink href={s.href}>{s.label}</PanelLink>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
