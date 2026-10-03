import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="Preader home">
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" className="fill-forest" />
        <path d="M20 46V18h13a10 10 0 0 1 0 20h-7" fill="none" className="stroke-canvas" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="36" y="42" width="10" height="5" rx="1.5" className="fill-gold" />
        <rect x="36" y="49" width="10" height="3" rx="1.5" className="fill-clay" />
      </svg>
      {!compact && (
        <span className="font-serif text-xl font-semibold tracking-tight text-ink">
          Preader
        </span>
      )}
    </Link>
  );
}
