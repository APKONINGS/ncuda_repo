import { WeaveColumn } from "@/components/brand/Motifs";
import { Figure } from "@/components/ui/Figure";
import { images } from "@/lib/content/images";
import { facts } from "@/lib/content/site";

export function Heritage() {
  return (
    <section
      id="heritage"
      aria-labelledby="heritage-title"
      className="relative overflow-hidden bg-cream py-[var(--spacing-section)]"
    >
      <div className="container-site grid items-start gap-14 lg:grid-cols-12 lg:gap-8">
        {/* Images */}
        <div className="relative lg:col-span-6" data-reveal>
          <div className="flex gap-4">
            <WeaveColumn
              className="hidden text-earth-600 sm:block"
              width={14}
            />
            <Figure
              image={images.mbengwiMonument}
              sizes="(min-width: 1024px) 42vw, 92vw"
              frameClassName="aspect-[4/5]"
              className="flex-1"
              captionClassName="max-w-[48%] sm:max-w-[55%]"
            />
          </div>
          <Figure
            image={images.northwestRegalia}
            sizes="(min-width: 1024px) 18vw, 45vw"
            frameClassName="aspect-square shadow-[var(--shadow-lift)] ring-8 ring-cream"
            className="relative z-10 -mt-28 ml-auto w-[48%] sm:w-[40%] lg:-mr-10"
            objectPosition="35% 30%"
          />
        </div>

        {/* Text */}
        <div className="lg:col-span-5 lg:col-start-8 lg:pt-16">
          <p className="eyebrow text-earth-700" data-reveal>
            01 — Heritage
          </p>
          <h2
            id="heritage-title"
            data-reveal
            className="display mt-6 text-[length:var(--text-display-md)] text-forest-900"
          >
            Heritage is not behind us.{" "}
            <span className="display-italic text-earth-700">We carry it.</span>
          </h2>
          <div className="prose-ncuda mt-8" data-reveal>
            <p>
              Heritage lives in what a community chooses to keep: the Engwo
              language spoken between generations, the gatherings that call
              people home, the dress worn on days that matter, the respect owed
              to the institutions of Ngwo.
            </p>
            <p>
              {facts.clan} The association exists so that this inheritance is
              not left to chance — so that it is preserved, celebrated, and
              handed on.
            </p>
          </div>

          <aside
            data-reveal
            className="mt-12 border-l-2 border-earth-600 pl-6"
            aria-label="On the name Njikwa"
          >
            <p className="font-display text-3xl italic leading-tight text-forest-900">
              “The road to the farm.”
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              {facts.njikwaMeaning} The winding line used throughout this site
              is drawn from that idea — the road that runs from our heritage to
              our future.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
