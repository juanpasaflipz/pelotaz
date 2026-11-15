/**
 * The Pelotaz mark as on the Facebook and Instagram profiles: a glossy red
 * ball beside the rounded grey wordmark. The name stays text, so it reads
 * for screen readers and search.
 */
export function Logo({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BallMark className="size-7" />
      <span className="display text-2xl text-tinta-suave">{name}</span>
    </span>
  );
}

export function BallMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="15" fill="var(--color-bola)" />
      <circle cx="11.5" cy="10.5" r="4" fill="#ffffff" />
    </svg>
  );
}
