import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddCommitteeMemberForm,
  CommitteeDocumentForm,
  CommitteeMessageForm,
  CommitteePositionForm,
  DisbursementForm,
  DissolveCommitteeButton,
  RemoveCommitteeMemberButton,
  ScheduleCommitteeMeetingForm,
} from "@/components/portal/CommitteeForms";
import { VoidContributionButton } from "@/components/portal/forms";
import { EmptyState, PageHeader, Panel, Pill, Stat, tableClasses as t } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { getCommittee } from "@/lib/portal/committees";
import { formatDate, formatDateTime, formatFileSize, formatMoney } from "@/lib/utils";

export const metadata = { title: "Committee" };

export default async function CommitteePage({ params }: PageProps<"/dashboard/committees/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  const data = getCommittee(actor, id);
  if (!data) notFound();
  const { committee: c, progress } = data;
  const active = c.status === "active";

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/dashboard/committees" className="text-sm text-ink-500 hover:text-forest-900">
          ← Committees
        </Link>
        <div className="mt-5">
          <PageHeader
            eyebrow={`${c.scopeLabel} committee`}
            title={c.name}
            description={c.purpose}
            actions={<Pill tone={active ? "green" : "neutral"}>{active ? "Active" : "Dissolved"}</Pill>}
          />
        </div>
      </div>

      {!active && (
        <Panel tone="cream">
          <p className="text-sm text-ink-700">
            Dissolved on {c.dissolvedAt && formatDate(c.dissolvedAt)} by {c.dissolvedByName} — “{c.dissolveReason}”. Its records are kept for
            reference.
          </p>
        </Panel>
      )}

      <div className="grid gap-6">
        <Panel title="About">
          <dl className="grid gap-3 text-sm">
            {[
              [
                "Created by",
                <>
                  {c.creatorName}, {formatDate(c.createdAt)}
                  <Contact contact={contactFor(actor, c.createdBy)} />
                </>,
              ],
              [
                "In charge",
                <>
                  {data.inCharge.post}
                  {data.inCharge.people.length > 0 ? `: ${data.inCharge.people.map((p) => p.name).join(", ")}` : " (post vacant)"}
                  {data.inCharge.people.map((p) => (
                    <Contact key={p.id} contact={contactFor(actor, p.id)} />
                  ))}
                </>,
              ],
              [
                "Project manager",
                data.managerId ? (
                  <>
                    {data.managerName}
                    <Contact contact={contactFor(actor, data.managerId)} />
                  </>
                ) : (
                  "—"
                ),
              ],
              ["Scope", c.scopeLabel],
              ["Project", data.project?.name ?? "—"],
              ["Your place", data.myPosition ?? (data.isCreator ? "In charge (not a member)" : "Overseeing")],
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        {data.project && progress && (
          <Panel title={`Project · ${data.project.name}`}>
            <p className="text-xs text-ink-500">
              Executives {formatMoney(data.project.expected.executive)} · Members {formatMoney(data.project.expected.member)} each, across{" "}
              {c.scope.level === "organization" ? "the whole organisation" : c.scope.level === "region" ? "the region's chapters" : "the chapter's members"}.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Expected" value={formatMoney(progress.expected)} />
              <Stat label="Collected" value={formatMoney(progress.collected)} hint="Through chapters and the committee" />
              <Stat label="Outstanding" value={formatMoney(progress.outstanding)} />
            </div>
          </Panel>
        )}
      </div>

      <Panel title="Members" bodyClassName="overflow-x-auto">
        {data.current.length === 0 ? (
          <p className="text-sm text-ink-500">{data.canManage ? "No members yet — add them below." : "No members yet."}</p>
        ) : (
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Name</th>
                <th scope="col" className={t.th}>Position</th>
                <th scope="col" className={`${t.th} hidden md:table-cell`}>Chapter</th>
                {data.canManage && (
                  <th scope="col" className={`${t.th} text-right`}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.current.map((m) => (
                <tr key={m.id}>
                  <td className={`${t.td} font-medium text-ink-900`}>
                    {m.name}
                    <Contact contact={contactFor(actor, m.memberId)} />
                  </td>
                  <td className={t.td}>
                    {data.canManage ? (
                      <CommitteePositionForm membershipId={m.id} current={m.position} positions={[...(m.position ? [{ value: m.position, label: m.positionLabel }] : []), ...data.freePositions]} />
                    ) : (
                      <Pill tone={m.position ? "dark" : "neutral"}>{m.positionLabel}</Pill>
                    )}
                  </td>
                  <td className={`${t.td} hidden md:table-cell`}>{m.chapterName}</td>
                  {data.canManage && (
                    <td className={`${t.td} text-right`}>
                      <RemoveCommitteeMemberButton membershipId={m.id} name={m.name} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.canManage && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-3 text-sm font-semibold text-forest-900">Add a member</h3>
            <AddCommitteeMemberForm committeeId={c.id} candidates={data.candidates} positions={data.freePositions} />
          </div>
        )}
        {data.past.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-xs font-medium text-earth-700">Past members ({data.past.length})</summary>
            <ul className="mt-2 grid gap-1 text-xs text-ink-700">
              {data.past.map((m) => (
                <li key={m.id}>
                  {m.name} — {m.positionLabel}, {formatDate(m.addedAt)} → {m.endedAt && formatDate(m.endedAt)}
                  {m.endReason && <span className="text-ink-500"> · {m.endReason}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <Panel title="Meetings" bodyClassName="overflow-x-auto">
        {data.meetings.length === 0 ? (
          <EmptyState compact title="No meetings yet">{data.canSchedule ? "Schedule the first one below." : ""}</EmptyState>
        ) : (
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>Meeting</th>
                <th scope="col" className={t.th}>When</th>
                <th scope="col" className={t.th}>Status</th>
                <th scope="col" className={`${t.th} hidden sm:table-cell`}>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {data.meetings.map((m) => (
                <tr key={m.id}>
                  <td className={t.td}>
                    <Link href={`/dashboard/committees/${c.id}/meetings/${m.id}`} className="font-medium text-forest-900 underline-offset-4 hover:text-earth-700 hover:underline">
                      {m.title}
                    </Link>
                    <span className="block text-xs text-ink-500">{m.location}</span>
                  </td>
                  <td className={`${t.td} num whitespace-nowrap`}>{formatDateTime(m.startsAt)}</td>
                  <td className={t.td}>
                    <Pill tone={m.status === "scheduled" ? "gold" : m.status === "held" ? "green" : "earth"}>{m.status === "scheduled" ? "Scheduled" : m.status === "held" ? "Held" : "Cancelled"}</Pill>
                  </td>
                  <td className={`${t.td} hidden text-xs text-ink-500 sm:table-cell`}>{m.minutes === "published" ? "Published" : m.minutes === "draft" ? "Draft" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.canSchedule && (
          <details className="mt-6 border-t border-line pt-5">
            <summary className="cursor-pointer text-sm font-semibold text-forest-900">Schedule a meeting</summary>
            <div className="mt-4">
              <ScheduleCommitteeMeetingForm committeeId={c.id} />
            </div>
          </details>
        )}
      </Panel>

      <Panel title="Documents">
        {data.documents.length === 0 ? (
          <EmptyState compact title="No documents yet"></EmptyState>
        ) : (
          <ul className="grid gap-3">
            {data.documents.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <span>
                  <a href={`/dashboard/public-relations/${d.id}/download`} className="font-medium text-forest-900 underline-offset-4 hover:text-earth-700 hover:underline">
                    {d.title}
                  </a>
                  {d.meetingTitle && <span className="text-xs text-ink-500"> · for “{d.meetingTitle}”</span>}
                </span>
                <span className="text-xs text-ink-500">
                  {d.uploadedByName}, {formatDate(d.uploadedAt)} · {formatFileSize(d.sizeBytes)}
                  <Contact contact={contactFor(actor, d.uploadedBy)} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.canUpload && (
          <details className="mt-6 border-t border-line pt-5">
            <summary className="cursor-pointer text-sm font-semibold text-forest-900">Share a document</summary>
            <div className="mt-4">
              <CommitteeDocumentForm committeeId={c.id} meetings={data.meetingOptions} />
            </div>
          </details>
        )}
      </Panel>

      {(data.messages.length > 0 || data.canMessageCreator || data.canMessageCommittee) && (
        <Panel title="Messages" tone="cream">
          {data.messages.length > 0 && (
            <ul className="grid gap-4">
              {data.messages.map((m) => (
                <li key={m.id} className="rounded-[var(--radius-md)] border border-line bg-paper p-4">
                  <p className="text-xs text-ink-500">
                    {m.from} → {m.to} · {formatDateTime(m.sentAt)}
                  </p>
                  <p className="mt-1 font-medium text-ink-900">{m.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{m.body}</p>
                  {m.attachments.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          <a href={`/dashboard/public-relations/${a.id}/download`} className="inline-block rounded-full border border-line px-3 py-1 text-xs font-medium text-forest-900 hover:border-earth-600">
                            {a.filename} <span className="text-ink-500">({formatFileSize(a.sizeBytes)})</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(data.canMessageCreator || data.canMessageCommittee) && (
            <div className={data.messages.length > 0 ? "mt-6 border-t border-line pt-5" : undefined}>
              <h3 className="mb-3 text-sm font-semibold text-forest-900">New message</h3>
              {data.canMessageCreator ? (
                <CommitteeMessageForm committeeId={c.id} to="creator" toLabel={`The ${data.inCharge.post} (${data.inCharge.people.map((p) => p.name).join(", ")})`} />
              ) : (
                <CommitteeMessageForm committeeId={c.id} to="committee" toLabel="Every member of the committee" />
              )}
            </div>
          )}
        </Panel>
      )}

      {data.money && (
        <Panel title="Project money" bodyClassName="overflow-x-auto">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={data.money.chapterProject ? "Collected by the chapter" : `Received by ${data.managerName}`}
              value={formatMoney(data.money.received)}
              hint={data.money.chapterProject ? "For this project" : "From chapters, for this project"}
            />
            <Stat label="Given to this committee" value={formatMoney(data.money.toThis)} hint={data.money.disbursed > data.money.toThis ? `${formatMoney(data.money.disbursed - data.money.toThis)} to the project's other committees` : undefined} />
            <Stat label={data.money.chapterProject ? "Not yet given out" : `Still held by ${data.managerName}`} value={formatMoney(data.money.held)} />
          </div>
          {data.canDisburse && (
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-semibold text-forest-900">Record money given to the committee</h3>
              <DisbursementForm committeeId={c.id} held={data.money.held} />
            </div>
          )}
          {data.money.disbursements.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold text-forest-900">Given to this committee</h3>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th scope="col" className={t.th}>Date</th>
                    <th scope="col" className={t.th}>Details</th>
                    <th scope="col" className={`${t.th} text-right`}>Amount</th>
                    {data.canDisburse && (
                      <th scope="col" className={`${t.th} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.money.disbursements.map((r) => (
                    <tr key={r.id} className={r.status === "voided" ? "bg-bone/40" : undefined}>
                      <td className={`${t.td} num whitespace-nowrap`}>{formatDate(r.on)}</td>
                      <td className={t.td}>
                        <span className={r.status === "voided" ? "text-ink-500 line-through" : "text-ink-900"}>{r.note}</span>
                        <span className="num block text-xs text-ink-500">{r.reference}</span>
                        {r.status === "voided" && <span className="block text-xs text-earth-800">Cancelled — {r.voidReason}</span>}
                      </td>
                      <td className={`${t.td} num whitespace-nowrap text-right font-medium text-ink-900 ${r.status === "voided" ? "line-through opacity-50" : ""}`}>{formatMoney(r.amount)}</td>
                      {data.canDisburse && (
                        <td className={`${t.td} text-right`}>{r.status === "recorded" && <VoidContributionButton id={r.id} kind="committee" label={r.note} />}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {data.money.sends.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold text-forest-900">Sent by chapters ({data.money.sends.length})</summary>
              <table className={`${t.table} mt-3`}>
                <thead>
                  <tr>
                    <th scope="col" className={t.th}>Date</th>
                    <th scope="col" className={t.th}>Chapter</th>
                    <th scope="col" className={`${t.th} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.money.sends.map((r) => (
                    <tr key={r.id} className={r.status === "voided" ? "bg-bone/40" : undefined}>
                      <td className={`${t.td} num whitespace-nowrap`}>{formatDate(r.on)}</td>
                      <td className={t.td}>
                        <span className={r.status === "voided" ? "text-ink-500 line-through" : "text-ink-900"}>{r.chapterName}</span>
                        <span className="num block text-xs text-ink-500">{r.reference}</span>
                        {r.status === "voided" && <span className="block text-xs text-earth-800">Cancelled — {r.voidReason}</span>}
                      </td>
                      <td className={`${t.td} num whitespace-nowrap text-right font-medium text-ink-900 ${r.status === "voided" ? "line-through opacity-50" : ""}`}>{formatMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Panel>
      )}

      {data.canManage && (
        <Panel title="Dissolve">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <DissolveCommitteeButton committeeId={c.id} name={c.name} />
          </div>
        </Panel>
      )}
    </div>
  );
}
