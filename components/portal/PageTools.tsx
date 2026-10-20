"use client";

import { cn } from "@/lib/utils";

/*
 * Page tools: download a spreadsheet of what the page shows, and print the
 * page (the portal's menus and buttons are left off the printout).
 */

const tool =
  "inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-paper px-3.5 text-sm font-medium text-forest-900 transition-colors hover:border-forest-700/40 hover:bg-cream/60 print:hidden";

/** A spreadsheet (CSV) download: `kind` is members, payments, expenses, registration or attendance. */
export function ExportLink({ kind, query, label = "Download spreadsheet", className }: { kind: string; query?: Record<string, string | undefined>; label?: string; className?: string }) {
  const q = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1])).toString();
  return (
    <a href={`/dashboard/export/${kind}${q ? `?${q}` : ""}`} download className={cn(tool, className)}>
      <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 3v10m0 0-4-4m4 4 4-4M4 15v2h12v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  );
}

/** Opens the sections marked for printing (e.g. collapsed meeting groups), then prints. */
function printPage() {
  document.querySelectorAll<HTMLDetailsElement>("details[data-print-open]").forEach((d) => (d.open = true));
  window.print();
}

export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={printPage} className={cn(tool, className)}>
      <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 7V3h8v4M6 14H4V8h12v6h-2M6 11h8v6H6z" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
