export default function PortalLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-8">
      <span className="sr-only">Loading…</span>
      <div className="animate-pulse border-b border-line pb-8">
        <div className="h-3 w-24 rounded bg-bone" />
        <div className="mt-4 h-10 w-80 max-w-full rounded bg-bone" />
        <div className="mt-4 h-3 w-[28rem] max-w-full rounded bg-bone/70" />
      </div>
      <div className="grid animate-pulse gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 rounded-[var(--radius-lg)] border border-line bg-cream/50" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-lg)] border border-line bg-cream/40" />
    </div>
  );
}
