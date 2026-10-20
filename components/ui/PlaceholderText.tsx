import type { Copy } from "@/lib/content/site";
import { cn } from "@/lib/utils";

/**
 * Renders site copy. If the copy is a placeholder (not yet supplied by NCUDA),
 * it is visibly marked so it is never mistaken for an official statement.
 */
export function CopyText({
  copy,
  className,
  as: Tag = "span",
  showNote = false,
}: {
  copy: Copy;
  className?: string;
  as?: "span" | "p" | "div";
  showNote?: boolean;
}) {
  if (typeof copy === "string") return <Tag className={className}>{copy}</Tag>;
  return (
    <Tag className={cn(className)}>
      <span className="placeholder-mark">{copy.text}</span>{" "}
      <PlaceholderBadge />
      {showNote && copy.note && <span className="mt-2 block text-xs text-ink-500">{copy.note}</span>}
    </Tag>
  );
}

export function PlaceholderBadge({ label = "To be confirmed", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex translate-y-[-0.1em] items-center gap-1 rounded-full border border-gold-500/50 bg-gold-100/80 px-2 py-0.5 align-middle font-sans text-[0.625rem] font-semibold uppercase not-italic tracking-[0.12em] text-gold-700",
        className,
      )}
      title="Placeholder — official wording to be supplied by NCUDA"
    >
      <span aria-hidden className="h-1 w-1 rotate-45 bg-gold-600" />
      {label}
    </span>
  );
}
