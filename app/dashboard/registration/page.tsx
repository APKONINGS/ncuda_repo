import { ExportLink, PrintButton } from "@/components/portal/PageTools";
import { CancelRenewalForm, StartRenewalForm } from "@/components/portal/RenewalForms";
import { AccessDenied, PageHeader, Panel, Pill, Stat } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { registrationDesk, registrationOverview } from "@/lib/portal/queries";
import { ChapterFeeForm, CreateMemberForm } from "@/components/portal/forms";
import { CollectRegistration } from "@/components/portal/CollectRegistration";
import type { Actor } from "@/lib/permissions/engine";
import { formatDate, formatMoney, plural } from "@/lib/utils";

export const metadata = { title: "Registration" };

/**
 * Registration (President General). Everyone must pay their chapter's
 * registration fee to be active; the yearly renewal makes everyone pay again
 * for the new year. Reachable while the President General's own registration
 * is unpaid, so it can be followed and, if needed, undone.
 */
export default async function RegistrationPage() {
  // Open while unpaid: the Financial Secretary registers members and collects fees, the President General follows it.
  const actor = await requireActor({ allowInactive: true });
  const desk = registrationDesk(actor);
  const national = registrationOverview(actor);
  if (!desk && !national) return <AccessDenied>Handled by each chapter&apos;s Financial Secretary.</AccessDenied>;
  const regional = national && !national.national;
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Registration"
        actions={
          <>
            <ExportLink kind="registration" />
            <PrintButton />
          </>
        }
        description={regional ? `${national.regionNames.join(", ")} · read only` : undefined}
      />
      {desk && <RegistrationDesk actor={actor} desk={desk} />}
      {national && <NationalRegistration actor={actor} data={national} />}
    </div>
  );
}

/** A chapter's registration desk (its Financial Secretary). */
function RegistrationDesk({ actor, desk }: { actor: Actor; desk: NonNullable<ReturnType<typeof registrationDesk>> }) {
  const many = desk.chapters.length > 1;
  return (
    <>
      {desk.chapters.map((c) => (
        <div key={c.chapterId} className="grid gap-6">
          {many && <h2 className="font-display text-2xl text-forest-900">{c.name}</h2>}
          <Panel title="Registration amount" tone="cream">
            <ChapterFeeForm chapterId={c.chapterId} chapterName={c.name} fee={c.fee} />
          </Panel>
          <Panel title={`Registration ${desk.year} to collect`} action={<span className="text-xs text-ink-500">{c.unpaid.length} to record</span>}>
            <CollectRegistration year={desk.year} people={c.unpaid} selfId={actor.member.id} showChapter={false} />
          </Panel>
          <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-display text-lg text-forest-900">Register a new member</span>
              </span>
              <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="border-t border-line px-6 py-6">
              <CreateMemberForm chapters={[{ id: c.chapterId, name: c.name, fee: c.fee }]} />
            </div>
          </details>
          <Panel title={`Registered for ${desk.year}`} action={<span className="text-xs text-ink-500">{c.paid.length} paid</span>}>
            {c.paid.length === 0 ? (
              <p className="text-sm text-ink-500">Nobody yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {c.paid.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      <span className="font-medium text-ink-900">{x.name}</span>
                      <span className="block text-xs text-ink-500">{x.post ?? "Member"}</span>
                      <Contact contact={contactFor(actor, x.id)} />
                    </span>
                    <span className="text-right text-xs text-ink-500">
                      <span className="num block text-sm font-medium text-ink-900">{formatMoney(x.amount)}</span>
                      {formatDate(x.on)} · <span className="num">{x.reference}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ))}
    </>
  );
}

/** The whole organisation's registration, and the yearly renewal (President General). */
function NationalRegistration({ actor, data }: { actor: Actor; data: NonNullable<ReturnType<typeof registrationOverview>> }) {
  const { renewal } = data;
  const pct = data.total ? Math.round((data.registered / data.total) * 100) : 0;
  return (
    <>

      <Panel
        title={renewal ? `Registration ${renewal.year}` : "Registration"}
        action={renewal ? <Pill tone="gold">Renewal in progress</Pill> : <Pill>Before the first renewal</Pill>}
      >
        <p className="text-sm text-ink-700">
          {renewal
            ? `Renewal started ${formatDate(renewal.openedAt)}. A registration payment for ${renewal.year} is needed to be active.`
            : "No renewal started."}
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Stat label="Registered" value={`${data.registered} / ${data.total}`} hint={`${pct}% of members`} />
          <Stat label="Still inactive" value={String(data.total - data.registered)} hint="Registration not yet recorded" />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-bone" role="img" aria-label={`${pct}% registered`}>
          <div className="h-full rounded-full bg-forest-700" style={{ width: `${pct}%` }} />
        </div>

        <ul className="mt-6 grid gap-3 border-t border-line pt-5">
          {data.byChapter.map((c) => (
            <li key={c.id ?? "none"} className="text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-medium text-ink-900">{c.name}</span>
                  {c.id && <span className="block text-xs text-ink-500">{c.fee ? `Registration fee ${formatMoney(c.fee)}` : "Registration fee not set yet"}</span>}
                </span>
                <span className="text-ink-700">
                  {c.registered} of {plural(c.total, "member")} registered
                </span>
              </div>
              {c.unpaid.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-earth-700">Not yet registered ({c.unpaid.length})</summary>
                  <ul className="mt-2 grid gap-1 rounded-[var(--radius-sm)] border border-line bg-paper p-3 text-xs">
                    {c.unpaid.map((p) => (
                      <li key={p.id} className="flex flex-wrap justify-between gap-2">
                        <span className="text-ink-900">
                          {p.name}
                          {p.executive && <span className="text-ink-500"> · executive</span>}
                          <Contact contact={contactFor(actor, p.id)} />
                        </span>
                        <span className="num text-ink-700">{p.fee ? `owes ${formatMoney(p.fee)}` : "—"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {c.id === null && (
                <p className="mt-1 text-xs text-ink-500">Must join a chapter to pay.</p>
              )}
            </li>
          ))}
        </ul>

        {renewal && data.national && (
          <details className="mt-6 rounded-[var(--radius-md)] border border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-earth-700">Cancel this renewal</summary>
            <div className="border-t border-line p-4">
              <CancelRenewalForm year={renewal.year} />
            </div>
          </details>
        )}
      </Panel>

      {data.national && (
        <Panel title={renewal ? "Start the next year's renewal" : "Start a yearly renewal"} tone="cream">
          <StartRenewalForm suggestedYear={data.suggestedYear} />
        </Panel>
      )}

      {data.national && data.history.length > 0 && (
        <Panel title="Past renewals">
          <ul className="grid gap-2 text-sm">
            {data.history.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-ink-900">Registration {r.year}</span>
                <span className="text-ink-500">
                  started {formatDate(r.openedAt)} by {r.openedByName}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
