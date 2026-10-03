import { Logo } from "@/components/logo";
import { PoweredBy } from "@/components/powered-by";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="kente h-1.5" aria-hidden />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">{children}</div>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted">
            Your writing is encrypted at rest and never used to train AI models.
          </p>
          <div className="mt-3 flex justify-center">
            <PoweredBy />
          </div>
        </div>
      </div>
    </div>
  );
}
