import Link from "next/link";
import type { ReactNode } from "react";
import { Cloth } from "@/components/brand/Cloth";
import { Logo, LogoMark } from "@/components/brand/Logo";

/**
 * Split-screen frame for the sign-in and password-reset screens: a bold
 * NCUDA cloth panel with an arched cartouche, a slanted edge, and the form
 * on undyed-cloth cream.
 */
export function PortalAuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Cloth panel */}
      <div className="relative h-[19rem] overflow-hidden [clip-path:polygon(0_0,100%_0,100%_86%,0_100%)] sm:h-[22rem] lg:h-auto lg:[clip-path:polygon(0_0,100%_0,86%_100%,0_100%)]">
        <Cloth />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-forest-950/25 via-transparent to-transparent" />

        {/* Arched cartouche */}
        <div className="absolute left-1/2 top-1/2 flex w-[13.5rem] -translate-x-1/2 -translate-y-[56%] flex-col items-center rounded-t-full rounded-b-[2rem] bg-paper px-6 pb-7 pt-10 shadow-[0_30px_60px_-20px_rgb(14_29_22/0.6)] ring-8 ring-paper/25 sm:w-[15rem] lg:-translate-x-[58%] lg:-translate-y-1/2 lg:rounded-b-full lg:px-8 lg:pb-16 lg:pt-16 xl:w-[17.5rem]">
          {/* hand-drawn road flourish */}
          <svg aria-hidden viewBox="0 0 120 60" className="absolute -right-6 top-6 hidden h-14 w-28 text-forest-900 lg:block" fill="none">
            <path
              d="M4 40 C 30 6, 70 4, 84 26 C 92 40, 74 50, 70 36 C 66 22, 96 12, 112 34"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path d="M104 34 l8 1 2 -8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-500 text-forest-950 sm:h-24 sm:w-24 lg:h-32 lg:w-32 [--logo-accent:var(--color-earth-700)] [--logo-accent-2:var(--color-paper)]">
            <LogoMark className="h-12 w-12 sm:h-14 sm:w-14 lg:h-20 lg:w-20" />
          </span>
          <p className="mt-4 text-center font-display text-[1.9rem] italic leading-[0.95] text-forest-900 [font-variation-settings:'SOFT'_100,'WONK'_1] sm:text-[2.2rem] lg:mt-7 lg:text-[2.75rem]">
            Member
            <br />
            Portal
          </p>
          <p className="mt-3 hidden text-center text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-earth-700 lg:block">
            Ngwo Cultural &amp;
            <br />
            Development Association
          </p>
        </div>

        <Link href="/" className="absolute left-5 top-5 rounded-full bg-paper/90 px-3 py-1.5 text-xs font-medium text-forest-900 backdrop-blur hover:bg-paper lg:left-8 lg:top-8">
          ← Home
        </Link>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col">
        <div className="hidden items-center justify-end px-10 py-8 lg:flex">
          <Link href="/" aria-label="NCUDA home" className="rounded-sm">
            <Logo />
          </Link>
        </div>
        <main id="main" className="flex flex-1 items-center px-6 pb-16 pt-4 sm:px-10 lg:pt-0">
          <div className="mx-auto w-full max-w-[24rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
