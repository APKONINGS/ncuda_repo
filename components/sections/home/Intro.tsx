import { CopyText } from "@/components/ui/PlaceholderText";
import { about, facts } from "@/lib/content/site";

export function Intro() {
  return (
    <section
      id="intro"
      aria-labelledby="intro-title"
      className="relative border-t border-line bg-paper py-[var(--spacing-section)]"
    >
      <div className="container-site grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-3" data-reveal>
          <p className="eyebrow text-earth-700">Who we are</p>
          <h2 id="intro-title" className="sr-only">
            Introducing the association
          </h2>
        </div>

        <div className="lg:col-span-9">
          <p
            data-reveal
            className="font-display text-[length:var(--text-display-sm)] font-[350] leading-[1.22] tracking-[-0.01em] text-ink-900"
          >
            This is where Ngwo people come together.{" "}
            <span className="text-ink-500">
              Wherever life has taken us — the village, Cameroon&apos;s cities,
              or far beyond — the association keeps us connected to{" "}
              <em className="display-italic text-earth-700">one home</em>, to
              one another, and to the work of building that home’s future.
            </span>
          </p>

          <div
            data-reveal
            className="mt-12 grid gap-10 md:grid-cols-2"
            style={{ ["--reveal-delay" as string]: "120ms" }}
          >
            <p className="prose-ncuda">{about.whoWeAre}</p>
            <div className="prose-ncuda">
              <CopyText copy={about.story} as="p" showNote />
            </div>
          </div>
        </div>
      </div>

      {/* Field notes — verified facts only */}
      <div className="container-site mt-20" data-reveal>
        <div className="flex items-baseline justify-between border-b border-line-strong pb-3">
          <h3 className="eyebrow text-ink-500">Where Ngwo is</h3>
          <span className="hidden text-xs text-ink-500 sm:inline">
            Field notes
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-5">
          {facts.location.map((f) => (
            <div
              key={f.label}
              className="border-b border-line py-5 lg:border-b-0 lg:border-r lg:pr-6 lg:last:border-r-0"
            >
              <dt className="text-xs uppercase tracking-[0.14em] text-ink-500">
                {f.label}
              </dt>
              <dd className="mt-2 font-display text-xl leading-tight text-forest-900">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
