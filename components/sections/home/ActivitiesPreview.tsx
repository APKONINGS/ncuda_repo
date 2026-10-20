import Image from "next/image";
import Link from "next/link";
import { Lozenge } from "@/components/brand/Motifs";
import { Arrow } from "@/components/ui/Button";
import { images } from "@/lib/content/images";
import { activityCategories } from "@/lib/content/site";

export function ActivitiesPreview() {
  return (
    <section
      aria-labelledby="activities-title"
      className="border-t border-line bg-paper py-[var(--spacing-section)]"
    >
      <div className="container-site">
        <div
          className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
          data-reveal
        >
          <div>
            <p className="eyebrow text-earth-700">Activities</p>
            <h2
              id="activities-title"
              className="display mt-5 text-[length:var(--text-display-md)] text-forest-900"
            >
              What we do{" "}
              <span className="display-italic text-earth-700">together</span>
            </h2>
          </div>
          <Link
            href="/activities"
            className="group/btn inline-flex items-center gap-3 self-start text-[0.9375rem] font-medium text-forest-900 md:self-auto"
          >
            All activity areas
            <Arrow />
          </Link>
        </div>

        <ul className="mt-14 border-t border-forest-900">
          {activityCategories.map((cat, i) => {
            const img = cat.image ? images[cat.image] : undefined;
            return (
              <li
                key={cat.slug}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 60}ms` }}
              >
                <Link
                  href={`/activities#${cat.slug}`}
                  className="group relative grid grid-cols-[1.5rem_1fr_auto] items-center gap-4 border-b border-line py-6 transition-colors hover:bg-cream/60 md:grid-cols-[2rem_minmax(0,22rem)_1fr_auto] md:gap-8 md:py-8"
                >
                  <span aria-hidden className="flex justify-center">
                    <Lozenge className="h-2.5 w-2.5 text-earth-600 transition-transform duration-500 group-hover:rotate-45" />
                  </span>
                  <h3 className="font-display text-[clamp(1.375rem,2.2vw,2rem)] leading-tight text-forest-900 transition-transform duration-500 ease-[var(--ease-soft)] group-hover:translate-x-2">
                    {cat.title}
                  </h3>
                  <p className="hidden max-w-xl text-[0.9375rem] leading-relaxed text-ink-500 md:block">
                    {cat.summary}
                  </p>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-forest-900 transition-colors group-hover:border-earth-600 group-hover:bg-earth-600 group-hover:text-paper">
                    <svg
                      aria-hidden
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                    >
                      <path
                        d="M1 11 11 1M4 1h7v7"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </span>
                  {img && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-24 top-1/2 z-10 hidden h-40 w-56 -translate-y-1/2 rotate-2 overflow-hidden opacity-0 shadow-[var(--shadow-lift)] transition-[opacity,transform] duration-500 ease-[var(--ease-soft)] group-hover:rotate-0 group-hover:opacity-100 xl:block"
                    >
                      <Image
                        src={img.src}
                        alt=""
                        fill
                        sizes="224px"
                        className="object-cover"
                      />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-ink-500">
          These are the areas our work falls into. Reports of specific
          activities will be published here as chapters share them.
        </p>
      </div>
    </section>
  );
}
