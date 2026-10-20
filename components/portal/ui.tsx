import Link from "next/link";
import type { ReactNode } from "react";
import type { ActionStatus, AttendanceStatus } from "@/lib/domain/types";
import { cn, formatDayOfMonth, formatMonthShort } from "@/lib/utils";

/* Shared building blocks for portal pages. */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="eyebrow text-earth-700">{eyebrow}</p>}
        <h1 className="display mt-3 text-[clamp(2rem,3.4vw,2.875rem)] text-forest-900">{title}</h1>
        {description && <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
  tone = "light",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "light" | "cream" | "dark";
}) {
  return (
    <section
      data-surface={tone === "dark" ? "dark" : undefined}
      className={cn(
        "min-w-0 rounded-[var(--radius-lg)] border",
        tone === "light" && "border-line bg-white/60",
        tone === "cream" && "border-line bg-cream/60",
        tone === "dark" && "on-dark border-forest-800 bg-forest-900 text-paper",
        className,
      )}
    >
      {(title || action) && (
        <header className={cn("flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6", tone === "dark" ? "border-paper/10" : "border-line")}>
          {title && <h2 className={cn("font-display text-lg", tone === "dark" ? "text-paper" : "text-forest-900")}>{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn("relative px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-earth-700 underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function EmptyState({ title, children, compact }: { title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-6" : "py-14")}>
      <svg aria-hidden viewBox="0 0 64 64" className={cn("text-line-strong", compact ? "h-10 w-10" : "h-14 w-14")} fill="none">
        <path d="M32 3 61 32 32 61 3 32Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 19 45 32 32 45 19 32Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 28 36 32 32 36 28 32Z" fill="var(--color-gold-500)" />
      </svg>
      <p className={cn("font-display text-forest-900", compact ? "mt-3 text-base" : "mt-5 text-xl")}>{title}</p>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{children}</p>}
    </div>
  );
}

const pill = "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-tight";

export function AttendancePill({ status }: { status: AttendanceStatus }) {
  const map: Record<AttendanceStatus, string> = {
    present: "bg-forest-100 text-forest-800",
    late: "bg-gold-100 text-gold-700",
    excused: "bg-bone text-ink-700",
    absent: "bg-earth-100 text-earth-800",
  };
  return <span className={cn(pill, map[status])}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export function ActionPill({ status, overdue }: { status: ActionStatus; overdue?: boolean }) {
  if (overdue && status !== "completed") return <span className={cn(pill, "bg-earth-100 text-earth-800")}>Overdue</span>;
  const map: Record<ActionStatus, [string, string]> = {
    pending: ["Pending", "bg-bone text-ink-700"],
    in_progress: ["In progress", "bg-gold-100 text-gold-700"],
    completed: ["Completed", "bg-forest-100 text-forest-800"],
  };
  return <span className={cn(pill, map[status][1])}>{map[status][0]}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "gold" | "earth" | "dark" }) {
  const map = {
    neutral: "bg-bone text-ink-700",
    green: "bg-forest-100 text-forest-800",
    gold: "bg-gold-100 text-gold-700",
    earth: "bg-earth-100 text-earth-800",
    dark: "bg-forest-900 text-paper",
  };
  return <span className={cn(pill, map[tone])}>{children}</span>;
}

/** Shown when a member opens a page their permissions do not cover. */
export function AccessDenied({ title = "This area is restricted", children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <svg aria-hidden viewBox="0 0 64 64" className="h-16 w-16 text-earth-600" fill="none">
        <path d="M32 3 61 32 32 61 3 32Z" stroke="currentColor" strokeWidth="1.5" />
        <rect x="23" y="30" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M27 30v-4a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <h1 className="display mt-6 text-4xl text-forest-900">{title}</h1>
      <p className="mt-4 leading-relaxed text-ink-700">
        {children ?? "You don't have access to this page."}
      </p>
      <Link href="/dashboard" className="mt-8 text-sm font-medium text-earth-700 underline-offset-4 hover:underline">
        Return to your overview
      </Link>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className="num mt-2 font-display text-3xl text-forest-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function DateBlock({ iso }: { iso: string }) {
  return (
    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--radius-md)] border border-line bg-paper">
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-earth-700">
        {formatMonthShort(iso)}
      </span>
      <span className="num font-display text-xl leading-none text-forest-900">{formatDayOfMonth(iso)}</span>
    </span>
  );
}

export const tableClasses = {
  table: "w-full border-collapse text-left text-sm",
  th: "border-b border-line-strong px-3 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500 first:pl-0 last:pr-0",
  td: "border-b border-line px-3 py-3.5 align-top text-ink-700 first:pl-0 last:pr-0",
};
