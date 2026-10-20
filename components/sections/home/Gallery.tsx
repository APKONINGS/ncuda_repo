import { Figure } from "@/components/ui/Figure";
import { images } from "@/lib/content/images";

export function Gallery() {
  return (
    <section
      aria-labelledby="gallery-title"
      className="bg-paper py-[var(--spacing-section)]"
    >
      <div className="container-site">
        <div className="grid gap-6 lg:grid-cols-12" data-reveal>
          <h2
            id="gallery-title"
            className="display text-[length:var(--text-display-md)] text-forest-900 lg:col-span-6"
          >
            The land{" "}
            <span className="display-italic text-earth-700">
              and its people
            </span>
          </h2>
          <p className="max-w-md self-end text-[0.9375rem] leading-relaxed text-ink-500 lg:col-span-5 lg:col-start-8">
            Photographs from Momo Division and the wider Northwest Region,
            captioned with where they were taken. Our own photographs of Ngwo
            will take their place as members contribute them.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-12 md:gap-6">
          <Figure
            image={images.northwestElders}
            sizes="(min-width: 768px) 30vw, 50vw"
            frameClassName="aspect-[3/4]"
            className="col-span-1 md:col-span-4 md:mt-24"
            objectPosition="center 20%"
          />
          <Figure
            image={images.highlandFarmland}
            sizes="(min-width: 768px) 55vw, 100vw"
            frameClassName="aspect-[4/3]"
            className="col-span-2 row-start-1 md:col-span-8 md:row-start-auto"
          />
          <Figure
            image={images.batiboValley}
            sizes="(min-width: 768px) 45vw, 100vw"
            frameClassName="aspect-[16/10]"
            className="col-span-2 md:col-span-7 md:col-start-2"
          />
          <Figure
            image={images.batiboWaterfall}
            sizes="(min-width: 768px) 25vw, 50vw"
            frameClassName="aspect-[3/4]"
            className="col-span-1 row-start-2 md:col-span-3 md:row-start-auto md:mt-10"
          />
        </div>
      </div>
    </section>
  );
}
