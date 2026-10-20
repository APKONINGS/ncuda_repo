import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * NCUDA visual motifs. All are ORIGINAL geometric designs created for this
 * site. They are inspired in a general way by the geometric, hand-made
 * design language of Cameroon's Grassfields, but they do not reproduce any
 * specific Ngwo textile, Ndop cloth or toghu embroidery pattern, and should
 * not be described as such.
 */

/** Horizontal lozenge band — used as a border, divider or edge. */
export function WeaveBand({
  className,
  height = 20,
  tone = "currentColor",
}: {
  className?: string;
  height?: number;
  tone?: string;
}) {
  const id = useId().replace(/:/g, "");
  const w = height * 1.4;
  const h = height;
  return (
    <svg aria-hidden className={cn("block w-full", className)} height={h} style={{ color: tone }}>
      <defs>
        <pattern id={`weave-${id}`} width={w} height={h} patternUnits="userSpaceOnUse">
          <path
            d={`M0 0 L${w / 4} ${h * 0.22} L${w / 2} 0 L${(w * 3) / 4} ${h * 0.22} L${w} 0Z`}
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d={`M0 ${h} L${w / 4} ${h * 0.78} L${w / 2} ${h} L${(w * 3) / 4} ${h * 0.78} L${w} ${h}Z`}
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d={`M${w / 2} ${h * 0.3} L${w * 0.68} ${h / 2} L${w / 2} ${h * 0.7} L${w * 0.32} ${h / 2}Z`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <path
            d={`M0 ${h * 0.42} L${w * 0.08} ${h / 2} L0 ${h * 0.58}Z M${w} ${h * 0.42} L${w * 0.92} ${h / 2} L${w} ${h * 0.58}Z`}
            fill="currentColor"
          />
        </pattern>
      </defs>
      <rect width="100%" height={h} fill={`url(#weave-${id})`} />
    </svg>
  );
}

/** Vertical variant of the band, for edges of tall images. */
export function WeaveColumn({ className, width = 18 }: { className?: string; width?: number }) {
  const id = useId().replace(/:/g, "");
  const h = width * 1.4;
  const w = width;
  return (
    <svg aria-hidden className={cn("block h-full", className)} width={w}>
      <defs>
        <pattern id={`weavec-${id}`} width={w} height={h} patternUnits="userSpaceOnUse">
          <path d={`M0 0 L${w * 0.22} ${h / 4} L0 ${h / 2} L${w * 0.22} ${(h * 3) / 4} L0 ${h}Z`} fill="currentColor" />
          <path d={`M${w} 0 L${w * 0.78} ${h / 4} L${w} ${h / 2} L${w * 0.78} ${(h * 3) / 4} L${w} ${h}Z`} fill="currentColor" />
          <path
            d={`M${w / 2} ${h * 0.32} L${w * 0.7} ${h / 2} L${w / 2} ${h * 0.68} L${w * 0.3} ${h / 2}Z`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </pattern>
      </defs>
      <rect width={w} height="100%" fill={`url(#weavec-${id})`} />
    </svg>
  );
}

/**
 * Topographic contour field — evokes the hills of Momo Division.
 * Deterministic so it renders identically on server and client.
 */
export function ContourField({
  className,
  lines = 14,
  seed = 1,
}: {
  className?: string;
  lines?: number;
  seed?: number;
}) {
  const paths: string[] = [];
  for (let i = 0; i < lines; i++) {
    const base = 40 + i * 34;
    let d = `M -20 ${base}`;
    for (let x = 0; x <= 1240; x += 40) {
      const y =
        base +
        Math.sin((x / 1200) * Math.PI * 2 * 1.3 + seed + i * 0.35) * (22 + i * 1.6) +
        Math.sin((x / 1200) * Math.PI * 2 * 3.1 + seed * 2 + i * 0.6) * 7;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 560"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none", className)}
      fill="none"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth="1" opacity={0.25 + (i % 4) * 0.12} />
      ))}
    </svg>
  );
}

/** Small lozenge glyph used as a bullet / separator. */
export function Lozenge({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className={cn("inline-block h-2.5 w-2.5", className)}>
      <path d="M5 0 10 5 5 10 0 5Z" fill="currentColor" />
    </svg>
  );
}
