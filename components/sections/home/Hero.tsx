import Image from "next/image";
import { Lozenge, WeaveColumn } from "@/components/brand/Motifs";
import { ButtonLink } from "@/components/ui/Button";
import { images } from "@/lib/content/images";

const story = [
  { n: "01", label: "Heritage", href: "#heritage" },
  { n: "02", label: "Community", href: "#community" },
  { n: "03", label: "Development", href: "#development" },
  { n: "04", label: "Future", href: "#future" },
];

export function Hero() {
  const img = images.momoHills;
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-paper"
    >
      {/* Image — bleeds to the right edge on large screens */}
      <div className="relative h-[52vh] min-h-[22rem] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[42%]">
        <Image
          src={img.src}
          alt={img.alt}
          fill
          preload
          placeholder="blur"
          sizes="(min-width: 1024px) 42vw, 100vw"
          className="animate-rise object-cover object-[60%_center] [--delay:100ms]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950/45 via-forest-950/5 to-forest-950/60" />
        <div className="absolute inset-0 bg-earth-600/10 mix-blend-multiply" />
        <WeaveColumn
          className="absolute inset-y-0 left-0 hidden text-earth-600 lg:block"
          width={16}
        />

        {/* Layered plate */}
        <div className="animate-rise absolute left-5 top-5 hidden max-w-[15rem] bg-paper/95 p-5 shadow-[var(--shadow-lift)] backdrop-blur [--delay:700ms] sm:block lg:left-auto lg:right-8 lg:top-8">
          <p className="eyebrow text-[0.625rem] text-earth-700">
            Where we come from
          </p>
          <p className="mt-3 font-display text-lg leading-snug text-forest-900">
            Ngwo, in the hills of Momo Division, Northwest Cameroon
          </p>
        </div>

        <p className="absolute bottom-4 left-5 right-5 text-[0.7rem] leading-snug text-paper/85 lg:bottom-6 lg:left-10">
          {img.caption} · Photo: {img.credit}, {img.license} (colour-graded)
        </p>
      </div>

      <div className="container-site relative">
        <div className="flex flex-col pb-14 pt-12 lg:min-h-[min(calc(100dvh-4.75rem),58rem)] lg:w-[58%] lg:justify-between lg:pb-10 lg:pr-14 lg:pt-16">
          <div>
            <p className="eyebrow animate-rise flex items-center gap-3 text-earth-700">
              <Lozenge className="text-gold-500" />
              Ngwo · Njikwa Subdivision · Momo Division
            </p>

            <h1 id="hero-title" className="mt-8">
              <span className="display animate-rise block text-[length:var(--text-display-xl)] font-[330] leading-[0.85] tracking-[-0.045em] text-forest-900 [--delay:120ms]">
                NCUDA
              </span>
              <span className="animate-rise mt-5 block max-w-[34rem] font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-[360] leading-[1.1] text-ink-900 [--delay:220ms]">
                Ngwo Cultural{" "}
                <span className="display-italic text-earth-700">and</span>{" "}
                Development Association
              </span>
            </h1>

            <p className="animate-rise mt-7 max-w-[32rem] text-[1.0625rem] leading-relaxed text-ink-700 [--delay:320ms]">
              The association of Ngwo people — at home in Njikwa and across
              Cameroon and the diaspora — working together to carry our heritage
              forward and to build the future of our community.
            </p>

            <div className="animate-rise mt-9 flex flex-wrap items-center gap-3 [--delay:420ms]">
              <ButtonLink href="#intro" size="lg" arrow>
                Who we are
              </ButtonLink>
              <ButtonLink
                href="/member-portal"
                size="lg"
                variant="ghost"
                className="border border-forest-800/20"
              >
                Member Portal
              </ButtonLink>
            </div>
          </div>

          {/* The road: Heritage → Community → Development → Future */}
          <nav
            aria-label="Our story"
            className="animate-rise relative mt-16 [--delay:600ms] lg:mt-20"
          >
            <svg
              aria-hidden
              viewBox="0 0 600 40"
              preserveAspectRatio="none"
              className="absolute left-0 right-0 top-[7px] hidden h-10 w-full text-earth-500 sm:block"
              fill="none"
            >
              <path
                d="M4 6 C 90 6, 120 30, 200 26 S 320 4, 400 10 S 520 32, 596 22"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeDasharray="1"
                pathLength={1}
                className="animate-draw [--delay:900ms] [--path-length:1]"
              />
            </svg>
            <ol className="relative grid grid-cols-2 gap-y-6 sm:grid-cols-4">
              {story.map((s) => (
                <li key={s.n}>
                  <a href={s.href} className="group inline-flex flex-col gap-3">
                    <span className="flex h-4 w-4 rotate-45 items-center justify-center border border-earth-600 bg-paper transition-colors group-hover:bg-earth-600">
                      <span className="h-1 w-1 bg-earth-600 group-hover:bg-paper" />
                    </span>
                    <span>
                      <span className="num block text-[0.6875rem] text-ink-500">
                        {s.n}
                      </span>
                      <span className="font-display text-xl text-forest-900 transition-colors group-hover:text-earth-700">
                        {s.label}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}
