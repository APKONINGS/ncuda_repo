import Image from "next/image";
import { Lozenge } from "@/components/brand/Motifs";
import { images } from "@/lib/content/images";

const circles = [
  {
    title: "At home",
    text: "Ngwo and the villages of Njikwa — where the language, the land and the institutions of the community are rooted.",
  },
  {
    title: "Across Cameroon",
    text: "Ngwo families in Bamenda, Yaoundé, Douala and the towns of the Southwest, meeting as chapters of one association.",
  },
  {
    title: "In the diaspora",
    text: "Members abroad who remain part of the community — contributing, gathering and keeping the connection alive.",
  },
];

export function Community() {
  const img = images.kobDance;
  return (
    <section
      id="community"
      aria-labelledby="community-title"
      className="bg-paper"
    >
      {/* Full-bleed image with text plate */}
      <div className="relative min-h-[34rem] overflow-hidden lg:min-h-[86vh]">
        <Image
          src={img.src}
          alt={img.alt}
          fill
          placeholder="blur"
          sizes="100vw"
          className="object-cover object-[center_78%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/90 via-forest-950/35 to-forest-950/10" />
        <div className="container-site relative flex min-h-[34rem] flex-col justify-end pb-10 pt-32 lg:min-h-[86vh] lg:pb-16">
          <div className="max-w-3xl" data-reveal>
            <p className="eyebrow text-gold-300">02 — Community</p>
            <h2
              id="community-title"
              className="display mt-6 text-[length:var(--text-display-lg)] text-paper"
            >
              Wherever we live,{" "}
              <span className="display-italic text-gold-300">
                we belong to Ngwo.
              </span>
            </h2>
          </div>
          <p className="mt-10 text-[0.7rem] text-paper/70">
            {img.caption} · Photo: {img.credit}, {img.license}
          </p>
        </div>
      </div>

      {/* The three circles of the community */}
      <div className="container-site py-[var(--spacing-section)]">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4" data-reveal>
            <p className="prose-ncuda text-lg">
              Community is people showing up for one another — at meetings, at
              celebrations, in moments of loss, and in the shared work of
              improving home. The association organises that responsibility so
              no one carries it alone.
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-line sm:grid-cols-3 lg:col-span-8">
            {circles.map((c, i) => (
              <li
                key={c.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 110}ms` }}
                className="flex flex-col bg-paper p-7"
              >
                <Lozenge className="text-earth-600" />
                <h3 className="mt-8 font-display text-2xl text-forest-900">
                  {c.title}
                </h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">
                  {c.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
