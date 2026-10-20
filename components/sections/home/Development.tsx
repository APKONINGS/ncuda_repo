import { ContourField } from "@/components/brand/Motifs";
import { Figure } from "@/components/ui/Figure";
import { PlaceholderBadge } from "@/components/ui/PlaceholderText";
import { images } from "@/lib/content/images";

/**
 * Real projects go in `projects` once NCUDA supplies them. Until then the
 * register renders an honest empty state rather than invented examples.
 */
const projects: Array<{
  name: string;
  location: string;
  status: "Planned" | "In progress" | "Completed";
}> = [];

export function Development() {
  return (
    <section
      id="development"
      aria-labelledby="development-title"
      data-surface="dark"
      className="on-dark relative overflow-hidden bg-forest-900 py-[var(--spacing-section)] text-paper"
    >
      <ContourField
        className="absolute -top-20 left-0 h-[34rem] w-full text-forest-700"
        lines={12}
        seed={2}
      />

      <div className="container-site relative grid gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow text-gold-300" data-reveal>
            03 — Development
          </p>
          <h2
            id="development-title"
            data-reveal
            className="display mt-6 text-[length:var(--text-display-md)]"
          >
            Development is{" "}
            <span className="display-italic text-gold-300">in our name.</span>
          </h2>
          <div
            className="mt-8 space-y-5 text-[1.0625rem] leading-relaxed text-paper/75"
            data-reveal
          >
            <p>
              Culture gives a community its identity; development gives it a
              future. The association brings members’ ideas, contributions and
              effort together around the needs of Ngwo — and keeps a careful
              record of what is decided, funded and done.
            </p>
            <p>
              Every project we undertake will be published in the register
              below, with its location and status, so members and partners can
              follow the work.
            </p>
          </div>

          {/* Project register */}
          <div className="mt-12" data-reveal>
            <div className="flex items-center justify-between border-b border-paper/25 pb-3">
              <h3 className="eyebrow text-paper/60">Project register</h3>
              <span className="num text-xs text-paper/50">
                {projects.length} published
              </span>
            </div>
            {projects.length === 0 ? (
              <div className="flex flex-col gap-3 border-b border-paper/10 py-6 text-sm text-paper/70 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Our development projects will be listed here as they are
                  published.
                </span>
                <PlaceholderBadge
                  label="Awaiting records"
                  className="self-start sm:self-auto"
                />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Project</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.name} className="border-b border-paper/10">
                      <td className="py-4 font-display text-lg">{p.name}</td>
                      <td className="py-4 text-paper/70">{p.location}</td>
                      <td className="py-4 text-right text-gold-300">
                        {p.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="relative lg:col-span-7 lg:pl-6">
          <Figure
            image={images.classroomBuild}
            sizes="(min-width: 1024px) 52vw, 92vw"
            frameClassName="aspect-[16/11]"
            tone="light"
            className="relative"
            captionClassName="max-w-[36%] sm:max-w-[50%]"
          />
          <Figure
            image={images.communityWorks}
            sizes="(min-width: 1024px) 24vw, 60vw"
            frameClassName="aspect-[4/3] ring-8 ring-forest-900"
            tone="light"
            objectPosition="55% 60%"
            className="relative -mt-16 ml-auto w-[62%] sm:w-[48%] lg:-mr-8"
          />
          <p className="mt-6 max-w-md text-xs leading-relaxed text-paper/50">
            Illustrative photographs of community works elsewhere in Momo
            Division. They do not depict our projects.
          </p>
        </div>
      </div>
    </section>
  );
}
