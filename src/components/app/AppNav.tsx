"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { History, Image as ImageIcon, LogOut, PenLine, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { cx } from "@/components/ui";
import { api } from "@/lib/client";

const LINKS = [
  { href: "/app", label: "Write", icon: PenLine },
  { href: "/app/images", label: "Images", icon: ImageIcon },
  { href: "/app/history", label: "History", icon: History },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNav({ name, used, limit }: { name: string; used: number; limit: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const pct = Math.min(100, Math.round((used / limit) * 100));

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="kente h-1" aria-hidden />
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Logo href="/app" />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive(href) ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block" title="Words rewritten in the last 24 hours">
              <div className="text-[11px] font-medium text-muted">
                {used.toLocaleString()} / {limit.toLocaleString()} words today
              </div>
              <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-sunken">
                <div className={cx("h-full rounded-full", pct > 90 ? "bg-risk-high" : "bg-gold")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="hidden max-w-32 truncate text-sm font-medium text-ink-soft lg:block">{name}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(href) ? "text-forest" : "text-muted")}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
