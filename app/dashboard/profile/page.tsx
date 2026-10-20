import { ChangePasswordForm } from "@/components/portal/ChangePasswordForm";
import { MemberHistory } from "@/components/portal/MemberRecord";
import { TransferMemberForm } from "@/components/portal/OrgEditForms";
import { ProfileDetailsForm } from "@/components/portal/ProfileDetailsForm";
import { PageHeader, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { passwordStatus } from "@/lib/auth/demo-credentials";
import { PERMISSIONS, type Permission } from "@/lib/permissions/catalog";
import { getMemberDetail, transferOptions } from "@/lib/portal/queries";
import { scopeLabel } from "@/lib/portal/visibility";
import { formatDate, initials } from "@/lib/utils";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const actor = await requireActor({ allowInactive: true });
  const detail = getMemberDetail(actor, actor.member.id)!;
  const m = actor.member;
  const placeSelf = actor.chapterId ? null : transferOptions(actor, m.id);

  // Group the actor's effective grants: permission → scopes (+ source).
  const grouped = new Map<string, Array<{ permission: Permission; scopes: string[] }>>();
  const byPerm = new Map<Permission, Set<string>>();
  for (const g of actor.grants) {
    const label = scopeLabel(g.scope) + (g.source.kind === "delegation" ? " (delegated)" : "");
    if (!byPerm.has(g.permission)) byPerm.set(g.permission, new Set());
    byPerm.get(g.permission)!.add(label);
  }
  for (const [p, scopes] of byPerm) {
    const group = PERMISSIONS[p].group;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ permission: p, scopes: [...scopes] });
  }

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="My profile" title="My profile" />

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-5">
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-forest-800 font-display text-2xl text-paper">{initials(m.fullName)}</span>
            <div>
              <p className="font-display text-2xl text-forest-900">{m.fullName}</p>
              <p className="num text-sm text-ink-500">Membership no. {m.memberNumber}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-line pt-6 text-sm">
            {[
              ["Chapter", detail.chapterName],
              ["Member since", formatDate(m.joinedAt)],
              [
                "Account created by",
                <>
                  {detail.createdByName}
                  <Contact contact={contactFor(actor, m.createdBy)} />
                </>,
              ],
              ["Status", m.status[0].toUpperCase() + m.status.slice(1)],
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="break-words text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t border-line pt-6">
            <h2 className="mb-4 font-display text-lg text-forest-900">Your details</h2>
            <ProfileDetailsForm fullName={m.fullName} email={m.email} phone={m.phone ?? ""} />
          </div>
        </Panel>

        <Panel title="My access" className="lg:col-span-7">
          <div className="flex flex-wrap gap-2">
            {actor.roles.length === 0 ? (
              <Pill>Member</Pill>
            ) : (
              actor.roles.map((r) => (
                <Pill key={r.assignment.id} tone="dark">
                  {r.role.name} · {scopeLabel(r.assignment.scope)}
                </Pill>
              ))
            )}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Your permissions:
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[...grouped.entries()].map(([group, perms]) => (
              <div key={group}>
                <h3 className="eyebrow text-[0.6875rem] text-earth-700">{group}</h3>
                <ul className="mt-2 grid gap-2 text-sm">
                  {perms.map((p) => (
                    <li key={p.permission}>
                      <span className="text-ink-900">{PERMISSIONS[p.permission].label}</span>
                      <span className="block text-xs text-ink-500">{p.scopes.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {placeSelf && (
        <Panel title="Join a chapter" tone="cream">
          <p className="mb-4 text-sm text-ink-700">Choose your chapter.</p>
          <TransferMemberForm memberId={m.id} memberName="You" placing destinations={placeSelf.destinations} />
        </Panel>
      )}

      <section id="password" className="scroll-mt-28">
        <Panel title="Password">
          <p className="mb-5 text-sm leading-relaxed text-ink-700">
            {{
              own: "Your own password.",
              temporary: "Temporary password — choose your own.",
              shared: "Shared demo password — choose your own.",
            }[passwordStatus(m.id)]}
          </p>
          <ChangePasswordForm />
        </Panel>
      </section>

      <MemberHistory detail={detail} contactOf={(id) => contactFor(actor, id)} />
    </div>
  );
}
