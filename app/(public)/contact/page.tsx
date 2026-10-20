import type { Metadata } from "next";
import { ContourField, Lozenge, WeaveColumn } from "@/components/brand/Motifs";
import { ContactForm } from "@/components/forms/ContactForm";
import { CopyText } from "@/components/ui/PlaceholderText";
import { contact } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with NCUDA — the Ngwo Cultural and Development Association — or ask to be connected with your nearest chapter.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <section aria-labelledby="contact-title" className="relative bg-paper">
      <div className="grid lg:min-h-[calc(100dvh-4.75rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Details panel */}
        <div
          data-surface="dark"
          className="on-dark relative overflow-hidden bg-forest-900 text-paper"
        >
          <ContourField
            className="absolute inset-0 h-full w-full text-forest-700/80"
            lines={16}
            seed={3}
          />
          <WeaveColumn
            className="absolute inset-y-0 right-0 hidden text-earth-600 lg:block"
            width={14}
          />
          <div className="relative flex h-full flex-col px-[var(--spacing-gutter)] py-16 lg:py-20 lg:pl-[max(var(--spacing-gutter),calc((100vw-88rem)/2+var(--spacing-gutter)))] lg:pr-16">
            <p className="eyebrow animate-rise flex items-center gap-3 text-gold-300">
              <Lozenge /> Contact
            </p>
            <h1
              id="contact-title"
              className="display animate-rise mt-7 text-[length:var(--text-display-lg)] [--delay:100ms]"
            >
              Let’s <span className="display-italic text-gold-300">talk.</span>
            </h1>
            <p className="animate-rise mt-6 max-w-sm text-lg leading-relaxed text-paper/75 [--delay:200ms]">
              Questions about the association, joining a chapter, or
              contributing to our work — we would be glad to hear from you.
            </p>

            <dl className="animate-rise mt-14 space-y-7 [--delay:300ms]">
              {[
                { label: "Email", copy: contact.email },
                { label: "Phone", copy: contact.phone },
                { label: "Office", copy: contact.address },
                { label: "Home", copy: contact.homeland },
              ].map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[5rem_1fr] gap-4 border-t border-paper/15 pt-5"
                >
                  <dt className="eyebrow pt-1 text-[0.625rem] text-paper/50">
                    {row.label}
                  </dt>
                  <dd className="text-[0.9375rem] leading-relaxed text-paper/90">
                    <CopyText copy={row.copy} />
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-auto pt-16">
              <div className="border-l-2 border-gold-500 pl-5">
                <p className="font-display text-xl">Want to become a member?</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper/65">
                  Membership is arranged through a chapter. Tell us where you
                  live and we’ll connect you with the chapter nearest to you.
                  Member accounts are created by authorized officers once
                  membership is complete.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-[var(--spacing-gutter)] py-16 lg:py-20 lg:pl-16 lg:pr-[max(var(--spacing-gutter),calc((100vw-88rem)/2+var(--spacing-gutter)))]">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="font-display text-3xl text-forest-900">
              Send a message
            </h2>
            <p className="mt-2 text-ink-500">
              All fields are required unless marked optional.
            </p>
            <div className="relative mt-10">
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
