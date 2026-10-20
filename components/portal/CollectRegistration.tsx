"use client";

import { useActionState } from "react";
import { recordContributionAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/Button";
import { formatMoney, watToday } from "@/lib/utils";

type Person = { id: string; name: string; post: string | null; chapterName: string; fee: number | null };

/**
 * The Financial Secretary's list of everyone in their chapter whose
 * registration is not yet recorded: one click records it at the chapter's
 * fee, paid in full today, with a receipt. Their own comes first.
 */
export function CollectRegistration({ year, people, selfId, showChapter }: { year: number; people: Person[]; selfId: string; showChapter: boolean }) {
  if (people.length === 0) return <p className="text-sm text-ink-700">Everyone in your chapter has paid their Registration {year}.</p>;
  return (
    <ul className="divide-y divide-line">
      {people.map((p) => (
        <Row key={p.id} person={p} year={year} self={p.id === selfId} showChapter={showChapter} />
      ))}
    </ul>
  );
}

function Row({ person, year, self, showChapter }: { person: Person; year: number; self: boolean; showChapter: boolean }) {
  const [state, action, pending] = useActionState(recordContributionAction, {});
  const today = watToday();
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">
        <span className="font-medium text-ink-900">
          {person.name}
          {self && " (you)"}
        </span>
        <span className="block text-xs text-ink-500">
          {[person.post ?? "Member", showChapter ? person.chapterName : null].filter(Boolean).join(" · ")}
        </span>
        {state.ok && <span className="block text-xs font-medium text-forest-700">{state.message}</span>}
        {!state.ok && state.error && <span className="block text-xs font-medium text-danger">{state.error}</span>}
      </span>
      {state.ok ? (
        <span className="text-xs font-medium text-forest-700">Paid ✓</span>
      ) : person.fee === null ? (
        <span className="text-xs text-ink-500">Set the registration amount first</span>
      ) : (
        <form action={action} className="flex items-center gap-3">
          <input type="hidden" name="ledger" value="chapter" />
          <input type="hidden" name="memberId" value={person.id} />
          <input type="hidden" name="type" value="registration" />
          <input type="hidden" name="receivedOn" value={today} />
          <span className="num text-sm text-ink-700">{formatMoney(person.fee)}</span>
          <Button type="submit" variant="secondary" size="sm" disabled={pending} aria-label={`Record ${person.name}'s Registration ${year} payment`}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
        </form>
      )}
    </li>
  );
}
