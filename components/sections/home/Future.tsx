import { WeaveBand } from "@/components/brand/Motifs";
import { ButtonLink } from "@/components/ui/Button";

export function Future() {
  return (
    <section
      id="future"
      aria-labelledby="future-title"
      className="relative overflow-hidden bg-cream"
    >
      <WeaveBand className="text-earth-600/80" height={14} />
      <div className="container-site relative grid gap-12 py-[var(--spacing-section)] lg:grid-cols-12">
        <svg
          aria-hidden
          viewBox="0 0 400 600"
          className="pointer-events-none absolute -right-10 top-0 hidden h-full text-earth-500/50 lg:block"
          fill="none"
        >
          <path
            d="M380 0 C 300 120, 360 200, 250 280 S 120 420, 180 600"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeDasharray="1"
            pathLength={1}
            className="animate-draw [--path-length:1]"
          />
        </svg>

        <div className="lg:col-span-7" data-reveal>
          <p className="eyebrow text-earth-700">04 — Future</p>
          <h2
            id="future-title"
            className="display mt-6 text-[length:var(--text-display-lg)] text-forest-900"
          >
            The road ahead{" "}
            <span className="display-italic text-earth-700">
              is one we build together.
            </span>
          </h2>
        </div>

        <div
          className="flex flex-col justify-end gap-10 lg:col-span-4 lg:col-start-9"
          data-reveal
        >
          <p className="prose-ncuda">
            Members follow meetings, decisions, contributions and documents
            through the Member Portal. If you are from Ngwo and want to join,
            get in touch and we will connect you with your nearest chapter.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink
              href="/member-portal"
              variant="secondary"
              size="lg"
              arrow
            >
              Member Portal
            </ButtonLink>
            <ButtonLink
              href="/contact"
              variant="ghost"
              size="lg"
              className="border border-forest-800/20"
            >
              Find your chapter
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
