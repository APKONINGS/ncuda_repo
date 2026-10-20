import type { Metadata } from "next";
import { Lozenge, WeaveBand } from "@/components/brand/Motifs";
import { CategoryIndex } from "@/components/sections/activities/CategoryIndex";
import { PageHero } from "@/components/sections/PageHero";
import { ButtonLink } from "@/components/ui/Button";
import { Figure } from "@/components/ui/Figure";
import { images } from "@/lib/content/images";
import { activityCategories, type ActivityCategory } from "@/lib/content/site";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Activities",
  description:
    "The areas of NCUDA’s work — cultural activities, community meetings, community development, social welfare, youth and family, and development initiatives.",
  alternates: { canonical: "/activities" },
};

export default function ActivitiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Activities"
        title={
          <>
            The life of the community,{" "}
            <span className="display-italic text-earth-700">
              in its many forms.
            </span>
          </>
        }
        intro={
          <p>
            Our work spans culture, mutual support and development. Below are
            the areas it covers. As chapters share reports, each area will fill
            with records of what members have done together.
          </p>
        }
        image={images.kobDance}
        objectPosition="center 75%"
      />

      <div className="h-16 bg-paper" />
      <CategoryIndex
        items={activityCategories.map(({ slug, title }) => ({ slug, title }))}
      />

      {activityCategories.map((cat, i) => (
        <CategorySection key={cat.slug} category={cat} index={i} />
      ))}

      <section
        aria-labelledby="share-title"
        className="bg-forest-900 text-paper"
        data-surface="dark"
      >
        <WeaveBand className="text-earth-600" height={14} />
        <div className="on-dark container-site grid gap-10 py-20 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <h2
              id="share-title"
              className="display text-[length:var(--text-display-sm)]"
            >
              Has your chapter done something worth sharing?
            </h2>
            <p className="mt-5 max-w-xl text-paper/70">
              Send a short report and photographs (with permission from the
              people pictured) and we’ll publish it in the right area.
            </p>
          </div>
          <div className="md:col-span-4 md:col-start-9 md:text-right">
            <ButtonLink href="/contact" variant="light" size="lg" arrow>
              Contact us
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

function CategorySection({
  category,
  index,
}: {
  category: ActivityCategory;
  index: number;
}) {
  const img = category.image ? images[category.image] : undefined;
  const number = String(index + 1).padStart(2, "0");
  const flipped = index % 2 === 1;

  const text = (
    <div
      className={cn(
        "flex flex-col justify-center",
        img ? "lg:col-span-5" : "lg:col-span-7",
      )}
      data-reveal
    >
      <p className="num text-sm text-earth-700">{number}</p>
      <h2
        id={`${category.slug}-title`}
        className="display mt-4 text-[length:var(--text-display-md)] text-forest-900"
      >
        {category.title}
      </h2>
      <p className="prose-ncuda mt-6 max-w-lg text-lg">{category.summary}</p>
      <Entries category={category} />
    </div>
  );

  return (
    <section
      id={category.slug}
      aria-labelledby={`${category.slug}-title`}
      className={cn(
        "scroll-mt-40 py-[clamp(4rem,8vw,7rem)]",
        index % 2 === 0 ? "bg-paper" : "bg-cream",
      )}
    >
      <div className="container-site grid gap-12 lg:grid-cols-12 lg:gap-10">
        {img ? (
          flipped ? (
            <>
              {text}
              <div className="lg:col-span-6 lg:col-start-7" data-reveal>
                <Figure
                  image={img}
                  sizes="(min-width: 1024px) 45vw, 92vw"
                  frameClassName="aspect-[5/4]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="lg:col-span-6" data-reveal>
                <Figure
                  image={img}
                  sizes="(min-width: 1024px) 45vw, 92vw"
                  frameClassName="aspect-[5/4]"
                />
              </div>
              <div className="lg:col-span-5 lg:col-start-8">{text}</div>
            </>
          )
        ) : (
          <>
            {text}
            <div
              aria-hidden
              className="hidden items-center justify-center lg:col-span-4 lg:col-start-9 lg:flex"
            >
              <svg
                viewBox="0 0 200 200"
                className="h-56 w-56 text-earth-600/25"
                fill="none"
              >
                <path
                  d="M100 4 196 100 100 196 4 100Z"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <path
                  d="M100 34 166 100 100 166 34 100Z"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <path d="M100 64 136 100 100 136 64 100Z" fill="currentColor" />
              </svg>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Entries({ category }: { category: ActivityCategory }) {
  return (
    <div className="mt-10 border-t border-line-strong pt-5">
      <h3 className="eyebrow text-[0.6875rem] text-ink-500">
        Published activities
      </h3>
      {category.entries.length === 0 ? (
        <p className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-ink-500">
          <Lozenge className="mt-1.5 text-gold-500" />
          No activities have been published in this area yet. Records will
          appear here as chapters share them.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {category.entries.map((e) => (
            <li key={e.title} className="py-4">
              <p className="text-xs text-ink-500">
                {formatDate(e.date)}
                {e.chapter && ` · ${e.chapter}`}
              </p>
              <p className="mt-1 font-display text-lg text-forest-900">
                {e.title}
              </p>
              <p className="mt-1 text-sm text-ink-700">{e.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
