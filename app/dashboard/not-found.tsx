import Link from "next/link";

export default function PortalNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <svg aria-hidden viewBox="0 0 64 64" className="h-16 w-16 text-line-strong" fill="none">
        <path d="M32 3 61 32 32 61 3 32Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 19 45 32 32 45 19 32Z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <h1 className="display mt-6 text-4xl text-forest-900">Not found</h1>
      <p className="mt-4 leading-relaxed text-ink-700">
        Not found, or not shared with you.
      </p>
      <Link href="/dashboard" className="mt-8 text-sm font-medium text-earth-700 underline-offset-4 hover:underline">
        Return to your overview
      </Link>
    </div>
  );
}
