import { cn } from "@/lib/utils";

/**
 * NCUDA mark — an ORIGINAL placeholder mark created for this site.
 * It is NOT NCUDA's official emblem. Replace with the official logo
 * when NCUDA supplies it (see docs/CONTENT_TODO.md).
 *
 * Concept: a lozenge (a shape common to Grassfields geometric design)
 * enclosing hill ridges and a road climbing into them — "Njikwa",
 * reportedly "road to the farm" in Engwo.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      <path d="M24 2.5 45.5 24 24 45.5 2.5 24Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9.5 29.5 17 22l5 5 7-8.5 9.5 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M24 45c-2.6-4.4 3.4-7-0.6-11.6"
        stroke="var(--logo-accent, var(--color-earth-500))"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M24 8.5 27 11.5 24 14.5 21 11.5Z" fill="var(--logo-accent-2, var(--color-gold-500))" />
    </svg>
  );
}

export function Logo({
  className,
  tone = "dark",
  showFullName = true,
}: {
  className?: string;
  tone?: "dark" | "light";
  showFullName?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3",
        tone === "light" ? "text-paper" : "text-forest-900",
        className,
      )}
    >
      <LogoMark className="h-9 w-9" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.35rem] font-medium tracking-[0.06em]">NCUDA</span>
        {showFullName && (
          <span
            className={cn(
              "mt-1 hidden text-[0.625rem] font-medium uppercase tracking-[0.16em] sm:block",
              tone === "light" ? "text-paper/65" : "text-ink-500",
            )}
          >
            Ngwo Cultural &amp; Development Association
          </span>
        )}
      </span>
    </span>
  );
}
