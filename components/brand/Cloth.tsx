import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * "NCUDA cloth" — a bold, saturated repeat in the spirit of the printed and
 * woven cloths worn across Cameroon and West Africa. It is an ORIGINAL design
 * built only from NCUDA's own motifs (the lozenge, the hill chevrons of the
 * logo and the dotted road); it does not reproduce any specific Ngwo,
 * Ndop, toghu or commercial wax-print pattern.
 */
export function Cloth({ className, size = 132 }: { className?: string; size?: number }) {
  const id = useId().replace(/:/g, "");
  const s = size;
  const c = s / 2;
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [c + Math.cos(a) * s * 0.36, c + Math.sin(a) * s * 0.36] as const;
  });

  return (
    <svg aria-hidden className={cn("block h-full w-full", className)}>
      <defs>
        <pattern id={`cloth-${id}`} width={s} height={s} patternUnits="userSpaceOnUse">
          <rect width={s} height={s} fill="var(--color-earth-700)" />

          {/* corner medallions (tile into full medallions) */}
          {[
            [0, 0],
            [s, 0],
            [0, s],
            [s, s],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={s * 0.2} fill="var(--color-gold-500)" />
              <circle cx={x} cy={y} r={s * 0.13} fill="var(--color-forest-700)" />
              <path
                d={`M${x} ${y - s * 0.07} L${x + s * 0.07} ${y} L${x} ${y + s * 0.07} L${x - s * 0.07} ${y}Z`}
                fill="var(--color-paper)"
              />
            </g>
          ))}

          {/* central medallion: green ring, dark field, hills, road */}
          <circle cx={c} cy={c} r={s * 0.3} fill="var(--color-clay-800)" />
          <circle cx={c} cy={c} r={s * 0.3} fill="none" stroke="var(--color-forest-600)" strokeWidth={s * 0.045} />
          <path
            d={`M${c - s * 0.17} ${c + s * 0.06} L${c - s * 0.07} ${c - s * 0.05} L${c} ${c + s * 0.02} L${c + s * 0.08} ${c - s * 0.08} L${c + s * 0.18} ${c + s * 0.06}`}
            fill="none"
            stroke="var(--color-gold-300)"
            strokeWidth={s * 0.028}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={`M${c} ${c + s * 0.2} L${c + s * 0.05} ${c + s * 0.14} L${c} ${c + s * 0.08} L${c - s * 0.05} ${c + s * 0.14}Z`}
            fill="var(--color-earth-500)"
          />

          {/* ring of road dots */}
          {dots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={s * (i % 2 ? 0.018 : 0.026)} fill="var(--color-paper)" />
          ))}

          {/* leaves on the edges (tile into lozenge pairs) */}
          {[
            [c, 0],
            [c, s],
            [0, c],
            [s, c],
          ].map(([x, y]) => (
            <path
              key={`l-${x}-${y}`}
              d={`M${x} ${y - s * 0.09} L${x + s * 0.045} ${y} L${x} ${y + s * 0.09} L${x - s * 0.045} ${y}Z`}
              fill="var(--color-forest-600)"
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#cloth-${id})`} />
    </svg>
  );
}
