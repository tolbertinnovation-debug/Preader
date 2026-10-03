"use client";

import { LoaderCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-forest text-canvas hover:bg-forest-strong shadow-sm dark:text-[#0b1a10]",
  gold: "bg-gold text-[#1d1a16] hover:brightness-105 shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "bg-risk-high text-white hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 select-none",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold tracking-wide text-ink-soft">
        {children}
      </label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/80 transition-colors focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3", disabled && "opacity-55")}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-forest" : "bg-line-strong",
        )}
      >
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-sunken p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-2 py-1.5 text-xs font-semibold transition-all",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "low" | "medium" | "high" | "good" | "gold"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-sunken text-ink-soft",
    low: "bg-risk-low-bg text-risk-low",
    medium: "bg-risk-medium-bg text-risk-medium",
    high: "bg-risk-high-bg text-risk-high",
    good: "bg-forest-soft text-forest",
    gold: "bg-gold-soft text-gold",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = "high", children, onClose }: { tone?: "high" | "medium" | "good"; children: ReactNode; onClose?: () => void }) {
  const tones = {
    high: "border-risk-high/30 bg-risk-high-bg text-risk-high",
    medium: "border-risk-medium/30 bg-risk-medium-bg text-risk-medium",
    good: "border-forest/30 bg-forest-soft text-forest",
  };
  return (
    <div role="alert" className={cx("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────── */

type Toast = { id: number; message: string; tone: "good" | "high" };
const ToastCtx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "good") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "good" ? "bg-ink text-canvas" : "bg-risk-high text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
