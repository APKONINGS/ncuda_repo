import { FileText, Lock } from "lucide-react";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { Contact } from "@/components/portal/Contact";
import { contactFor } from "@/lib/portal/contacts";
import type { DocumentCategory } from "@/lib/domain/types";
import { listDocuments, uploadOptions } from "@/lib/portal/queries";
import { UploadDocumentForm } from "@/components/portal/UploadDocumentForm";
import { formatDate, formatFileSize } from "@/lib/utils";

export const metadata = { title: "Public Relations" };

const CATEGORIES: Record<DocumentCategory, string> = {
  minutes: "Meeting minutes",
  association: "Association documents",
  reports: "Reports",
  financial: "Financial documents",
  forms: "Forms",
  other: "Other",
};

export default async function PublicRelationsPage({ searchParams }: PageProps<"/dashboard/public-relations">) {
  const actor = await requireActor();
  const params = await searchParams;
  const all = listDocuments(actor);
  const active = typeof params.category === "string" && params.category in CATEGORIES ? (params.category as DocumentCategory) : null;
  const docs = active ? all.filter((d) => d.category === active) : all;
  const upload = uploadOptions(actor);
  const counts = all.reduce<Record<string, number>>((acc, d) => ((acc[d.category] = (acc[d.category] ?? 0) + 1), acc), {});

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Public Relations"
        title="Public Relations"
      />

      {upload && (
        <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-lg text-forest-900">Share a document</span>
            </span>
            <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-line px-6 py-6">
            <UploadDocumentForm scopes={upload.scopes} roles={upload.roles} />
          </div>
        </details>
      )}

      <nav aria-label="Document categories">
        <ul className="flex flex-wrap gap-2">
          <li>
            <a href="/dashboard/public-relations" aria-current={!active ? "page" : undefined} className={`inline-flex rounded-full px-4 py-2 text-sm ${!active ? "bg-forest-900 text-paper" : "border border-line text-ink-700 hover:bg-cream"}`}>
              All <span className="num ml-2 opacity-60">{all.length}</span>
            </a>
          </li>
          {(Object.keys(CATEGORIES) as DocumentCategory[])
            .filter((c) => counts[c])
            .map((c) => (
              <li key={c}>
                <a href={`/dashboard/public-relations?category=${c}`} aria-current={active === c ? "page" : undefined} className={`inline-flex rounded-full px-4 py-2 text-sm ${active === c ? "bg-forest-900 text-paper" : "border border-line text-ink-700 hover:bg-cream"}`}>
                  {CATEGORIES[c]} <span className="num ml-2 opacity-60">{counts[c]}</span>
                </a>
              </li>
            ))}
        </ul>
      </nav>

      <Panel bodyClassName="p-0 sm:p-0">
        {docs.length === 0 ? (
          <EmptyState title="No documents here yet"></EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-cream text-forest-800">
                  <FileText className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{d.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                    <Pill>{CATEGORIES[d.category]}</Pill>
                    <span>{d.sharedWithLabel}</span>
                    <span aria-hidden>·</span>
                    <span>
                      Uploaded {formatDate(d.uploadedAt)} by {d.uploadedByName}
                      <Contact inline contact={contactFor(actor, d.uploadedBy)} />
                    </span>
                    <span aria-hidden>·</span>
                    <span className="num">{formatFileSize(d.sizeBytes)}</span>
                  </p>
                </div>
                {d.canDownload ? (
                  <a href={`/dashboard/public-relations/${d.id}/download`} className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-line-strong px-4 py-2 text-sm font-medium text-forest-900 transition-colors hover:border-forest-800 hover:bg-forest-900 hover:text-paper">
                    Download<span className="sr-only"> {d.title}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> View only
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
