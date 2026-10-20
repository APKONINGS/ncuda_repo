import { Panel, Pill } from "@/components/portal/ui";
import { roleName } from "@/lib/permissions/roles";
import type { getMemberDetail } from "@/lib/portal/queries";
import { formatDate } from "@/lib/utils";
import { Contact } from "@/components/portal/Contact";
import type { ContactInfo } from "@/lib/portal/contacts";

type Detail = NonNullable<ReturnType<typeof getMemberDetail>>;

/** Chapter history and role history — shared by "My profile" and member detail. */
export function MemberHistory({ detail, contactOf }: { detail: Detail; contactOf?: (memberId: string | null) => ContactInfo | null }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Chapter history">
        <ol className="relative grid gap-5">
          <span aria-hidden className="absolute bottom-2 left-[0.3rem] top-2 w-px bg-line-strong" />
          {detail.chapterHistory.map((a) => (
            <li key={a.id} className="relative flex gap-4">
              <span aria-hidden className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45 ${a.endedAt ? "border border-ink-300 bg-paper" : "bg-earth-600"}`} />
              <div>
                <p className="font-medium text-ink-900">{a.chapterName}</p>
                <p className="num text-xs text-ink-500">
                  {formatDate(a.startedAt)} → {a.endedAt ? formatDate(a.endedAt) : "present"}
                </p>
                {a.note && <p className="mt-1 text-xs text-ink-500">{a.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Role history">
        {detail.roleHistory.length === 0 ? (
          <p className="text-sm text-ink-500">Ordinary member — no offices held.</p>
        ) : (
          <ol className="grid gap-4">
            {detail.roleHistory.map((r) => (
              <li key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink-900">{roleName(r.roleKey)}</p>
                  <Pill tone={r.status === "active" ? "green" : "neutral"}>{r.status === "active" ? "Active" : "Uplifted"}</Pill>
                </div>
                <p className="mt-1 text-xs text-ink-500">{r.scopeLabel}</p>
                <p className="num mt-1 text-xs text-ink-500">
                  {formatDate(r.assignedAt)} → {r.endedAt ? formatDate(r.endedAt) : "present"} · assigned by {r.assignedByName}
                </p>
                <Contact contact={contactOf?.(r.assignedBy ?? null)} />
                {r.endedAt && (
                  <>
                    <p className="mt-1 text-xs text-ink-500">
                      Uplifted by {r.endedByName}
                      {r.endReason ? ` — ${r.endReason}` : ""}
                    </p>
                    <Contact contact={contactOf?.(r.endedBy ?? null)} />
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
