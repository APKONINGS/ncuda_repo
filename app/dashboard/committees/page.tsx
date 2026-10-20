import Link from "next/link";
import { CreateCommitteeForm } from "@/components/portal/CommitteeForms";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import { committeeProjectOptions, committeeScopeOptions, listCommittees } from "@/lib/portal/committees";
import { formatDate, plural } from "@/lib/utils";

export const metadata = { title: "Committees" };

export default async function CommitteesPage() {
  const actor = await requireActor();
  const scopes = committeeScopeOptions(actor);
  const committees = listCommittees(actor);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Committees"
        title="Committees"
      />

      {scopes.length > 0 && (
        <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-lg text-forest-900">Create a committee</span>
              <span className="text-sm text-ink-500">For an existing project.</span>
            </span>
            <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-line px-6 py-6">
            <CreateCommitteeForm scopes={scopes} projects={committeeProjectOptions(actor)} />
          </div>
        </details>
      )}

      {committees.length === 0 ? (
        <Panel>
          <EmptyState compact title="No committees to show">
            
          </EmptyState>
        </Panel>
      ) : (
        /* Grouped by level: national, regional, chapter. */
        (
          [
            ["organization", "National committees"],
            ["region", "Regional committees"],
            ["chapter", "Chapter committees"],
          ] as const
        ).map(([level, label]) => {
          const list = committees.filter((c) => c.scope.level === level);
          if (list.length === 0) return null;
          const active = list.filter((c) => c.status === "active").length;
          return (
            <details key={level} open className="group rounded-[var(--radius-lg)] border border-line bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block font-display text-lg text-forest-900">{label}</span>
                  <span className="text-sm text-ink-500">
                    {active} active{list.length > active && ` · ${list.length - active} dissolved`}
                  </span>
                </span>
                <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <ul className="grid gap-4 border-t border-line p-4 sm:p-6 md:grid-cols-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/committees/${c.id}`}
                      className="block h-full rounded-[var(--radius-lg)] border border-line bg-white/60 p-5 transition-[border-color,box-shadow] hover:border-forest-700/40 hover:shadow-[var(--shadow-soft)]"
                    >
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="font-display text-lg text-forest-900">{c.name}</span>
                        <Pill tone={c.status === "active" ? "green" : "neutral"}>{c.status === "active" ? "Active" : "Dissolved"}</Pill>
                      </span>
                      <span className="mt-1 block text-sm text-ink-700">Project: {c.projectName}</span>
                      <span className="mt-3 block text-xs text-ink-500">
                        {c.scopeLabel} · {plural(c.members, "member")} · President: {c.president ?? "not appointed"}
                      </span>
                      <span className="mt-1 block text-xs text-ink-500">
                        Created by {c.creatorName} on {formatDate(c.createdAt)}
                        {c.myPlace && ` · You: ${c.myPlace}`}
                      </span>
                      <Contact plain contact={contactFor(actor, c.createdBy)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })
      )}
    </div>
  );
}
