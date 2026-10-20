import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberHistory } from "@/components/portal/MemberRecord";
import { MemberStatusForm } from "@/components/portal/MemberStatusForm";
import { TransferMemberForm } from "@/components/portal/OrgEditForms";
import { PageHeader, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { getMemberDetail, transferOptions } from "@/lib/portal/queries";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata = { title: "Member" };

export default async function MemberDetailPage({ params }: PageProps<"/dashboard/members/[id]">) {
  const { id } = await params;
  const actor = await requireActor({ allowInactive: true });
  const detail = getMemberDetail(actor, id);
  if (!detail) notFound();
  const m = detail.member;
  const transfer = transferOptions(actor, m.id);

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/dashboard/members" className="text-sm text-ink-500 hover:text-forest-900">← Members</Link>
        <div className="mt-5">
          <PageHeader
            eyebrow={detail.chapterName}
            title={m.fullName}
            description={`Member ${m.memberNumber}`}
            actions={<Pill tone={m.status === "active" ? "green" : "earth"}>{m.status}</Pill>}
          />
        </div>
      </div>

      <Panel title="Membership record">
        <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Email", m.email],
            ["Phone", m.phone ?? "Not provided"],
            ["Member since", formatDate(m.joinedAt)],
            ["Account created", formatDateTime(m.createdAt)],
            [
              "Created by",
              <>
                {detail.createdByName}
                <Contact contact={contactFor(actor, m.createdBy)} />
              </>,
            ],
            ["Current chapter", detail.chapterName],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink-500">{k}</dt>
              <dd className="mt-1 text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {(m.status !== "active" || detail.statusDecision.ok) && (
        <Panel title="Membership status" tone={m.status === "active" ? "light" : "cream"}>
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
            <div className="text-sm leading-relaxed text-ink-700">
              {m.status === "active" ? (
                <p>Active.</p>
              ) : (
                <p>
                  <span className="font-semibold text-earth-800">Suspended.</span> {m.fullName} cannot sign in and holds no
                  permissions while suspended.
                </p>
              )}
              {detail.statusChange && (
                <p className="mt-2 text-xs text-ink-500">
                  Last changed {formatDateTime(detail.statusChange.at)} by {detail.statusChange.byName} — “{detail.statusChange.reason}”
                  <Contact contact={contactFor(actor, detail.statusChange.by)} />
                </p>
              )}
            </div>
            {detail.statusDecision.ok ? (
              <MemberStatusForm memberId={m.id} memberName={m.fullName} suspended={m.status !== "active"} />
            ) : (
              <p className="max-w-xs text-xs text-ink-500">{detail.statusDecision.reason}</p>
            )}
          </div>
        </Panel>
      )}

      {transfer && (
        <Panel title={transfer.from ? "Move to another chapter" : "Place in a chapter"} tone="cream">
          {transfer.finesOwed > 0 && transfer.from ? (
            <p className="text-sm leading-relaxed text-ink-700">
              {m.fullName} still owes <span className="font-medium text-earth-800">{formatMoney(transfer.finesOwed)}</span> in fines — to be paid before a move.
            </p>
          ) : transfer.blockedBy ? (
            <p className="text-sm leading-relaxed text-ink-700">
              {m.fullName} holds <span className="font-medium">{transfer.blockedBy}</span> — uplift that post first.
            </p>
          ) : (
            <TransferMemberForm memberId={m.id} memberName={m.fullName} placing={!transfer.from} destinations={transfer.destinations} />
          )}
        </Panel>
      )}

      <MemberHistory detail={detail} contactOf={(id) => contactFor(actor, id)} />
    </div>
  );
}
