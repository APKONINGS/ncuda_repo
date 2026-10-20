import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ContourField, WeaveBand } from "@/components/brand/Motifs";

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col overflow-hidden bg-paper">
      <ContourField className="absolute inset-0 h-full w-full text-line" lines={16} seed={9} />
      <div className="container-site relative py-8">
        <Link href="/" aria-label="NCUDA home" className="rounded-sm">
          <Logo />
        </Link>
      </div>
      <div className="container-site relative flex flex-1 flex-col justify-center pb-24">
        <p className="eyebrow text-earth-700">404</p>
        <h1 className="display mt-6 max-w-3xl text-[length:var(--text-display-lg)] text-forest-900">
          This road <span className="display-italic text-earth-700">doesn’t lead anywhere.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg text-ink-700">The page you were looking for has moved or never existed.</p>
        <div className="mt-10 flex gap-4">
          <Link href="/" className="rounded-[var(--radius-sm)] bg-earth-600 px-5 py-3 font-medium text-paper hover:bg-earth-700">
            Back to home
          </Link>
          <Link href="/contact" className="rounded-[var(--radius-sm)] border border-forest-800/20 px-5 py-3 font-medium text-forest-900">
            Contact NCUDA
          </Link>
        </div>
      </div>
      <WeaveBand className="relative text-earth-600/70" height={14} />
    </main>
  );
}
