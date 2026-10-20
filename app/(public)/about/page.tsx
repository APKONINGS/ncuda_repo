import type { Metadata } from "next";
import Link from "next/link";
import { ContourField, Lozenge, WeaveBand } from "@/components/brand/Motifs";
import { PageHero } from "@/components/sections/PageHero";
import { Figure } from "@/components/ui/Figure";
import { CopyText, PlaceholderBadge } from "@/components/ui/PlaceholderText";
import { images } from "@/lib/content/images";
import { about, facts } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who NCUDA is, where Ngwo is, and how the Ngwo Cultural and Development Association is organised — from the central organisation to regions, chapters and members.",
  alternates: { canonical: "/about" },
};

const structure = [
  {
    level: "Organisation",
    text: "The association as a whole — its central leadership and the decisions that apply to every member.",
  },
  {
    level: "Region",
    optional: true,
    text: "Chapters are grouped into regions — including diaspora regions — each with a Regional Coordinator.",
  },
  {
    level: "Chapter",
    text: "The local home of every member. Chapters meet, keep records and carry out the association’s work where members live.",
  },
  {
    level: "Member",
    text: "Every member — including every officer and the President General — belongs to exactly one chapter at a time.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title={
          <>
            One association,{" "}
            <span className="display-italic text-earth-700">
              rooted in Ngwo.
            </span>
          </>
        }
        intro={<p>{about.whoWeAre}</p>}
        image={images.batiboValley}
        objectPosition="center 65%"
      />

      {/* Story */}
      <section
        aria-labelledby="story-title"
        className="bg-paper py-[var(--spacing-section)]"
      >
        <div className="container-site grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4" data-reveal>
            <p className="eyebrow text-earth-700">Our story</p>
            <h2
              id="story-title"
              className="display mt-5 text-[length:var(--text-display-sm)] text-forest-900"
            >
              How we began
            </h2>
          </div>
          <div className="prose-ncuda lg:col-span-7 lg:col-start-6" data-reveal>
            <CopyText copy={about.story} as="p" showNote />
            <p>{facts.dispersal}</p>
            <p>{facts.branches}</p>
          </div>
        </div>
      </section>

      {/* Mission & vision */}
      <section
        aria-label="Mission and vision"
        data-surface="dark"
        className="on-dark relative overflow-hidden bg-forest-900 text-paper"
      >
        <ContourField
          className="absolute inset-0 h-full w-full text-forest-700/70"
          lines={12}
          seed={7}
        />
        <div className="container-site relative">
          <div className="grid gap-px border-x border-paper/10 bg-paper/10 md:grid-cols-2">
            {[
              { label: "Mission", copy: about.mission },
              { label: "Vision", copy: about.vision },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-forest-900 px-2 py-16 md:px-10 md:py-24"
                data-reveal
              >
                <h2 className="eyebrow text-gold-300">{item.label}</h2>
                <p className="mt-8 font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-[350] leading-[1.25]">
                  {typeof item.copy === "string" ? item.copy : item.copy.text}
                </p>
                {typeof item.copy !== "string" && (
                  <p className="mt-6 flex flex-wrap items-center gap-3 text-xs text-paper/55">
                    <PlaceholderBadge label="Draft wording" />
                    {item.copy.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section
        aria-labelledby="objectives-title"
        className="bg-paper py-[var(--spacing-section)]"
      >
        <div className="container-site">
          <div
            className="flex flex-wrap items-end justify-between gap-6"
            data-reveal
          >
            <h2
              id="objectives-title"
              className="display text-[length:var(--text-display-md)] text-forest-900"
            >
              Objectives
            </h2>
            <PlaceholderBadge label="Draft — awaiting the constitution" />
          </div>
          <ul className="mt-12 grid gap-x-10 border-t border-forest-900 md:grid-cols-2">
            {about.objectives.map((o, i) => (
              <li
                key={i}
                className="flex gap-6 border-b border-line py-8"
                data-reveal
              >
                <Lozenge className="mt-2.5 h-3 w-3 shrink-0 text-earth-600" />
                <p className="pt-1.5 text-lg leading-relaxed text-ink-700">
                  {typeof o === "string" ? o : o.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cultural identity */}
      <section
        aria-labelledby="identity-title"
        className="bg-cream py-[var(--spacing-section)]"
      >
        <div className="container-site grid items-center gap-14 lg:grid-cols-12">
          <div className="lg:col-span-6" data-reveal>
            <p className="eyebrow text-earth-700">Cultural identity</p>
            <h2
              id="identity-title"
              className="display mt-5 text-[length:var(--text-display-md)] text-forest-900"
            >
              Who the Ngwo are
            </h2>
            <div className="prose-ncuda mt-8">
              <p>
                Ngwo lies in Njikwa Subdivision of Momo Division, in Cameroon’s
                Northwest Region, about 70 km south-west of Bamenda. Its people
                speak Engwo, a Grassfields language.
              </p>
              <p>{facts.clan}</p>
              <p>{facts.njikwaMeaning}</p>
            </div>
            <div className="mt-10 rounded-[var(--radius-md)] border border-gold-500/40 bg-paper/60 p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-forest-900">
                <Lozenge className="text-gold-600" /> A note on cultural
                accuracy
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Photographs on this site come from Momo Division and the wider
                Northwest Region and are captioned with where they were taken.
                None is presented as Ngwo unless it was taken in Ngwo. Members
                are warmly invited to contribute photographs and accounts of
                Ngwo’s traditions, festivals and institutions.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 lg:col-start-8" data-reveal>
            <Figure
              image={images.northwestElders}
              sizes="(min-width: 1024px) 36vw, 92vw"
              frameClassName="aspect-[4/5]"
              objectPosition="center 25%"
            />
          </div>
        </div>
      </section>

      {/* Structure */}
      <section
        aria-labelledby="structure-title"
        className="bg-paper py-[var(--spacing-section)]"
      >
        <div className="container-site grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4" data-reveal>
            <p className="eyebrow text-earth-700">How we are organised</p>
            <h2
              id="structure-title"
              className="display mt-5 text-[length:var(--text-display-sm)] text-forest-900"
            >
              From the whole association to every member
            </h2>
            <p className="prose-ncuda mt-6">
              A member’s chapter answers <em>where they belong</em>. A role —
              President, Secretary, Financial Secretary and so on — answers{" "}
              <em>what responsibility they hold</em>. The two are kept separate.
            </p>
          </div>
          <ol className="relative lg:col-span-7 lg:col-start-6">
            <span
              aria-hidden
              className="absolute bottom-8 left-[0.6rem] top-8 w-px bg-line-strong"
            />
            {structure.map((s, i) => (
              <li
                key={s.level}
                className="relative flex gap-8 pb-10 last:pb-0"
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
              >
                <span className="relative z-10 mt-1.5 flex h-5 w-5 shrink-0 rotate-45 items-center justify-center border border-earth-600 bg-paper">
                  <span className="h-1.5 w-1.5 bg-earth-600" />
                </span>
                <div>
                  <h3 className="flex items-center gap-3 font-display text-2xl text-forest-900">
                    {s.level}
                    {s.optional && (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 font-sans text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-500">
                        Optional
                      </span>
                    )}
                  </h3>
                  <p className="mt-2 max-w-xl leading-relaxed text-ink-700">
                    {s.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Leadership */}
      <section
        aria-labelledby="leadership-title"
        className="border-t border-line bg-paper pb-[var(--spacing-section)] pt-20"
      >
        <div className="container-site">
          <div
            className="flex flex-wrap items-end justify-between gap-6"
            data-reveal
          >
            <h2
              id="leadership-title"
              className="display text-[length:var(--text-display-md)] text-forest-900"
            >
              Leadership
            </h2>
            <p className="max-w-md text-sm text-ink-500">
              Officer names will be published once confirmed by the association.
              Leadership roles are filled by election and assignment according
              to the association’s rules.
            </p>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {about.leadership.map((l) => (
              <li key={l.role} className="group" data-reveal>
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream">
                  <ContourField
                    className="absolute inset-0 h-full w-full text-line-strong"
                    lines={9}
                    seed={l.role.length}
                  />
                  <svg
                    aria-hidden
                    viewBox="0 0 48 48"
                    className="relative h-14 w-14 text-forest-800/40"
                    fill="none"
                  >
                    <path
                      d="M24 2.5 45.5 24 24 45.5 2.5 24Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 font-display text-xl text-forest-900">
                  {l.role}
                </h3>
                <CopyText
                  copy={l.name}
                  as="p"
                  className="mt-1 text-sm text-ink-500"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Photo credits */}
      <section
        id="photo-credits"
        aria-labelledby="credits-title"
        className="bg-cream py-20"
      >
        <WeaveBand className="mb-16 text-earth-600/60" height={12} />
        <div className="container-site">
          <h2 id="credits-title" className="eyebrow text-ink-700">
            Photo credits
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-500">
            Photographs are used under Creative Commons licences from Wikimedia
            Commons. Some have been cropped or colour-graded. Adaptations of CC
            BY-SA works are shared under the same licence. Full details are
            recorded in the project’s{" "}
            <code className="text-xs">public/images/SOURCES.md</code>.
          </p>
          <ul className="mt-8 grid gap-x-10 gap-y-3 text-sm md:grid-cols-2">
            {Object.values(images).map((img) => (
              <li
                key={img.sourceUrl}
                className="flex flex-wrap gap-x-2 border-b border-line pb-3"
              >
                <span className="text-ink-900">{img.caption}</span>
                <span className="text-ink-500">
                  — {img.credit},{" "}
                  <Link
                    href={img.sourceUrl}
                    className="underline decoration-line-strong underline-offset-4 hover:text-earth-700"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {img.license}
                    <span className="sr-only">
                      {" "}
                      (opens Wikimedia Commons in a new tab)
                    </span>
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
