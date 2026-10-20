import Image from "next/image";
import type { ReactNode } from "react";
import { Lozenge } from "@/components/brand/Motifs";
import type { SiteImage } from "@/lib/content/images";

/** Editorial page header: oversized title, intro, and an offset image. */
export function PageHero({
  eyebrow,
  title,
  intro,
  image,
  objectPosition,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
  image: SiteImage;
  objectPosition?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-paper pt-14 lg:pt-20">
      <div className="container-site grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <p className="eyebrow animate-rise flex items-center gap-3 text-earth-700">
            <Lozenge className="text-gold-500" />
            {eyebrow}
          </p>
          <h1 className="display animate-rise mt-7 text-[length:var(--text-display-lg)] text-forest-900 [--delay:100ms]">
            {title}
          </h1>
        </div>
        <div className="animate-rise flex items-end lg:col-span-4 lg:col-start-9 [--delay:220ms]">
          <div className="prose-ncuda text-lg">{intro}</div>
        </div>
      </div>

      <div className="relative mt-14 lg:mt-20">
        <div className="container-site">
          <figure className="animate-rise relative [--delay:300ms]">
            <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[21/9]">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                preload
                placeholder="blur"
                sizes="(min-width: 1408px) 1300px, 92vw"
                className="object-cover"
                style={objectPosition ? { objectPosition } : undefined}
              />
            </div>
            <figcaption className="mt-3 text-[0.75rem] text-ink-500">
              <span className="text-ink-700">{image.caption}</span> · Photo:{" "}
              {image.credit}, {image.license}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
