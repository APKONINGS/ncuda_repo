"use client";

import { useActionState, useState } from "react";
import { transferMemberAction, updateChapterAction, updateRegionAction } from "@/app/dashboard/actions";
import { Field, Input, Select } from "@/components/forms/Field";
import { FormMessage } from "@/components/portal/forms";
import { Button } from "@/components/ui/Button";

/** Rename a region (President General). */
export function EditRegionForm({ regionId, name }: { regionId: string; name: string }) {
  const [state, action, pending] = useActionState(updateRegionAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const id = `region-${regionId}-name`;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="regionId" value={regionId} />
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <Field id={id} label="Region name" error={err("name")}>
        <Input id={id} name="name" required maxLength={120} defaultValue={state.values?.name ?? name} aria-invalid={err("name") ? true : undefined} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Edit a chapter's name and location (its region's coordinator, or the President General). */
export function EditChapterForm({ chapterId, name, location }: { chapterId: string; name: string; location: string }) {
  const [state, action, pending] = useActionState(updateChapterAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const id = (k: string) => `chapter-${chapterId}-${k}`;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="chapterId" value={chapterId} />
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("name")} label="Chapter name" error={err("name")}>
          <Input id={id("name")} name="name" required maxLength={120} defaultValue={state.values?.name ?? name} aria-invalid={err("name") ? true : undefined} />
        </Field>
        <Field id={id("location")} label="Location" error={err("location")}>
          <Input id={id("location")} name="location" required maxLength={160} defaultValue={state.values?.location ?? location} aria-invalid={err("location") ? true : undefined} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save chapter"}
        </Button>
      </div>
    </form>
  );
}

/** Move a member to another chapter (same region or not), or place someone not yet in a chapter. */
export function TransferMemberForm({
  memberId,
  memberName,
  placing,
  destinations,
}: {
  memberId: string;
  memberName: string;
  /** True when the member is not in a chapter yet. */
  placing: boolean;
  destinations: Array<{ id: string; name: string; regionName: string }>;
}) {
  const [state, action, pending] = useActionState(transferMemberAction, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const regions = [...new Set(destinations.map((d) => d.regionName))];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="memberId" value={memberId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="toChapterId" label={placing ? "Chapter" : "New chapter"} error={err("toChapterId")}>
          <Select id="toChapterId" name="toChapterId" required defaultValue={state.values?.toChapterId ?? ""} aria-invalid={err("toChapterId") ? true : undefined}>
            <option value="" disabled>
              Choose a chapter…
            </option>
            {regions.map((r) => (
              <optgroup key={r} label={r}>
                {destinations
                  .filter((d) => d.regionName === r)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field id="transfer-note" label="Note" optional error={err("note")}>
          <Input id="transfer-note" name="note" maxLength={300} placeholder="e.g. Relocated to Buea" defaultValue={state.values?.note ?? ""} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">
          {placing
            ? `${memberName} will become a member of the chosen chapter.`
            : `History is kept.`}
        </p>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : placing ? "Place in chapter" : "Move member"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A region's header row: its name and coordinator, with a "Rename" button at
 * the right that opens the rename box underneath.
 */
export function RegionRow({
  regionId,
  name,
  chapters,
  coordinatorName,
  coordinatorEmail = null,
  coordinatorPhone = null,
}: {
  regionId: string;
  name: string;
  chapters: string;
  coordinatorName: string | null;
  coordinatorEmail?: string | null;
  coordinatorPhone?: string | null;
}) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-medium text-ink-900">{name}</span>
          <span className="text-xs text-ink-500">{chapters}</span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {coordinatorName ? (
            <span className="grid text-sm text-ink-700 sm:text-right">
              <span>
                Coordinator: <span className="font-medium text-ink-900">{coordinatorName}</span>
              </span>
              <span className="text-xs">
                {coordinatorPhone ? (
                  <a href={`tel:${coordinatorPhone.replace(/s+/g, "")}`} className="num text-earth-700 underline-offset-4 hover:underline">
                    {coordinatorPhone}
                  </a>
                ) : (
                  <span className="text-ink-500">Phone not provided</span>
                )}
                {coordinatorEmail && (
                  <>
                    {" · "}
                    <a href={`mailto:${coordinatorEmail}`} className="break-all text-earth-700 underline-offset-4 hover:underline">
                      {coordinatorEmail}
                    </a>
                  </>
                )}
              </span>
            </span>
          ) : (
            <span className="rounded-full bg-earth-100 px-2.5 py-1 text-xs font-medium text-earth-800">No coordinator yet</span>
          )}
          <Button type="button" variant="ghost" size="sm" className="border border-line-strong" aria-expanded={renaming} onClick={() => setRenaming((v) => !v)}>
            {renaming ? "Close" : "Rename"}
          </Button>
        </span>
      </div>
      {renaming && (
        <div className="rounded-[var(--radius-md)] border border-line bg-cream/40 p-4">
          <EditRegionForm regionId={regionId} name={name} />
        </div>
      )}
    </div>
  );
}
