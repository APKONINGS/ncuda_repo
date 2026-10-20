"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <svg aria-hidden viewBox="0 0 64 64" className="h-16 w-16 text-earth-600" fill="none">
        <path d="M32 3 61 32 32 61 3 32Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 20v16M32 42v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h1 className="display mt-6 text-4xl text-forest-900">Something went wrong</h1>
      <p className="mt-4 leading-relaxed text-ink-700">
        Something went wrong. Nothing was changed. Please try again.
      </p>
      {error.digest && <p className="num mt-3 text-xs text-ink-500">Reference: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <button onClick={reset} className="rounded-[var(--radius-sm)] bg-forest-800 px-5 py-2.5 text-sm font-medium text-paper hover:bg-forest-900">
          Try again
        </button>
        <Link href="/dashboard" className="rounded-[var(--radius-sm)] border border-line-strong px-5 py-2.5 text-sm font-medium text-forest-900">
          Overview
        </Link>
      </div>
    </div>
  );
}
