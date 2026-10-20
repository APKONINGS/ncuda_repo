import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ContourField, WeaveBand } from "@/components/brand/Motifs";
import { CopyText } from "@/components/ui/PlaceholderText";
import { contact, nav, site } from "@/lib/content/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark relative overflow-hidden bg-forest-950 text-paper" data-surface="dark">
      <WeaveBand className="text-earth-600" height={14} />
      <ContourField className="absolute inset-0 h-full w-full text-forest-700/50" lines={10} seed={4} />

      <div className="container-site relative grid gap-14 py-20 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-5">
          <Logo tone="light" />
          <p className="mt-6 max-w-sm text-[0.9375rem] leading-relaxed text-paper/70">
            The {site.name} brings Ngwo people together — at home and across the diaspora — to carry their heritage
            forward and to work for the development of their community.
          </p>
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-gold-300/80">
            Ngwo · Njikwa · Momo Division · Northwest Cameroon
          </p>
        </div>

        <nav aria-label="Footer" className="md:col-span-3">
          <h2 className="eyebrow text-paper/50">Explore</h2>
          <ul className="mt-5 space-y-3">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-paper/85 transition-colors hover:text-gold-300">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/member-portal" className="text-paper/85 transition-colors hover:text-gold-300">
                Member Portal
              </Link>
            </li>
          </ul>
        </nav>

        <div className="md:col-span-4">
          <h2 className="eyebrow text-paper/50">Contact</h2>
          <dl className="mt-5 space-y-4 text-[0.9375rem] text-paper/85">
            <div>
              <dt className="sr-only">Email</dt>
              <dd>
                <CopyText copy={contact.email} />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Phone</dt>
              <dd>
                <CopyText copy={contact.phone} />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Address</dt>
              <dd>
                <CopyText copy={contact.address} />
              </dd>
            </div>
          </dl>
          {contact.social.length > 0 && (
            <ul className="mt-6 flex gap-4">
              {contact.social.map((s) => (
                <li key={s.href}>
                  <a href={s.href} className="text-paper/70 hover:text-gold-300" rel="noopener noreferrer">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="relative border-t border-paper/10">
        <div className="container-site flex flex-col gap-3 py-6 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}
          </p>
          <p>
            Photography under Creative Commons — see{" "}
            <Link href="/about#photo-credits" className="underline decoration-paper/30 underline-offset-4 hover:text-paper">
              photo credits
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
