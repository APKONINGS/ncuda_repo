import Image from "next/image";
import type { SiteImage } from "@/lib/content/images";
import { cn } from "@/lib/utils";

/**
 * Photograph with an honest caption + credit. Uses `fill`, so the parent
 * decides the aspect ratio via `frameClassName`.
 */
export function Figure({
  image,
  sizes,
  frameClassName,
  className,
  captionClassName,
  objectPosition,
  preload,
  caption = true,
  tone = "dark",
  zoom = true,
  grayscale,
}: {
  image: SiteImage;
  sizes: string;
  frameClassName?: string;
  className?: string;
  captionClassName?: string;
  objectPosition?: string;
  preload?: boolean;
  caption?: boolean;
  tone?: "dark" | "light";
  zoom?: boolean;
  grayscale?: boolean;
}) {
  return (
    <figure className={cn("relative", className)}>
      <div className={cn("relative overflow-hidden bg-bone", zoom && "img-zoom", frameClassName)}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          placeholder="blur"
          preload={preload}
          loading={preload ? "eager" : "lazy"}
          className={cn("object-cover", grayscale && "grayscale")}
          style={objectPosition ? { objectPosition } : undefined}
        />
      </div>
      {caption && (
        <figcaption
          className={cn(
            "mt-3 flex flex-wrap items-baseline gap-x-2 text-[0.75rem] leading-snug",
            tone === "dark" ? "text-ink-500" : "text-paper/60",
            captionClassName,
          )}
        >
          <span className={tone === "dark" ? "text-ink-700" : "text-paper/85"}>{image.caption}</span>
          <span aria-hidden>·</span>
          <span>
            Photo: {image.credit}, {image.license}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
