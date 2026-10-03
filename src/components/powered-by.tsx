import { ORG } from "@/lib/brand";

/** Small "Powered by Tolbert Innovation Hub" credit with a woven accent. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs text-muted ${className ?? ""}`}>
      <span className="kente inline-block h-2.5 w-5 rounded-sm" aria-hidden />
      <span>
        Powered by <strong className="font-semibold text-ink-soft">{ORG.name}</strong>
      </span>
    </p>
  );
}
