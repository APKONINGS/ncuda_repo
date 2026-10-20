import Link from "next/link";
import { DateBlock, PageHeader, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { listMeetings } from "@/lib/portal/queries";
import { schedulingOptions } from "@/lib/portal/meetings";
import { ScheduleMeetingForm } from "@/components/portal/MeetingForms";
import { scopeLabel } from "@/lib/portal/visibility";
import { formatTime, ORG_TIME_ZONE_LABEL } from "@/lib/utils";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const actor = await requireActor();
  const { upcoming, past } = listMeetings(actor);
  const options = schedulingOptions(actor);

  return (
    <div className="grid gap-10">
      <PageHeader
        eyebrow="Meetings"
        title="Meetings & minutes"
      />

      {options && (
        <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-lg text-forest-900">Schedule a meeting</span>
            </span>
            <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-line px-6 py-6">
            <ScheduleMeetingForm options={options} />
          </div>
        </details>
      )}

      {/* Grouped by level: chapter, regional, national. Each shows its upcoming and past meetings. */}
      {(
        [
          ["chapter", "Chapter meetings"],
          ["region", "Regional meetings"],
          ["organization", "National meetings"],
        ] as const
      ).map(([level, label]) => {
        const soon = upcoming.filter((m) => m.scope.level === level);
        const before = past.filter((m) => m.scope.level === level);
        return (
          <details key={level} className="group rounded-[var(--radius-lg)] border border-line bg-paper">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-display text-lg text-forest-900">{label}</span>
                <span className="text-sm text-ink-500">
                  {soon.length} upcoming · {before.length} past
                </span>
              </span>
              <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="grid gap-6 border-t border-line p-4 sm:p-6">
              <section aria-label={`Upcoming ${label.toLowerCase()}`} className="grid gap-3">
                <h2 className="eyebrow text-ink-500">Upcoming</h2>
                {soon.length === 0 ? (
                  <p className="text-sm text-ink-500">No upcoming meetings.</p>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {soon.map((m) => (
                      <li key={m.id}>
                        <Link href={`/dashboard/meetings/${m.id}`} className="group/card flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-white/60 p-5 transition-[border-color,box-shadow] hover:border-forest-700/40 hover:shadow-[var(--shadow-soft)]">
                          <div className="flex items-start justify-between gap-3">
                            <DateBlock iso={m.startsAt} />
                            <Pill tone={m.scope.level === "chapter" ? "neutral" : m.scope.level === "region" ? "gold" : "dark"}>{scopeLabel(m.scope)}</Pill>
                          </div>
                          <p className="mt-5 font-display text-xl leading-snug text-forest-900 group-hover/card:text-earth-700">{m.title}</p>
                          <p className="mt-2 text-sm text-ink-500">
                            {formatTime(m.startsAt)} {ORG_TIME_ZONE_LABEL} · {m.location}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label={`Past ${label.toLowerCase()}`} className="grid gap-3">
                <h2 className="eyebrow text-ink-500">Past</h2>
                {before.length === 0 ? (
                  <p className="text-sm text-ink-500">No past meetings.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line">
                    {before.map((m) => (
                      <li key={m.id}>
                        <Link href={`/dashboard/meetings/${m.id}`} className="group/row flex items-center gap-4 px-5 py-4 transition-colors hover:bg-cream/50 sm:px-6">
                          <DateBlock iso={m.startsAt} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink-900 group-hover/row:text-earth-700">{m.title}</span>
                            <span className="block text-xs text-ink-500">
                              {scopeLabel(m.scope)} · {m.location}
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            {m.status === "cancelled" ? (
                              <Pill tone="earth">{m.notHeld ? "Not held" : "Cancelled"}</Pill>
                            ) : m.minutesStatus === "published" ? (
                              <Pill tone="green">Minutes published</Pill>
                            ) : m.minutesStatus === "draft" ? (
                              <Pill tone="gold">Minutes in draft</Pill>
                            ) : (
                              <Pill>No minutes yet</Pill>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </details>
        );
      })}
    </div>
  );
}
