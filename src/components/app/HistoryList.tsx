"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import { MODES, type Mode } from "@/lib/options";
import type { HistoryItem } from "@/lib/history";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function HistoryList({ initial, initialNext }: { initial: HistoryItem[]; initialNext: string | null }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  async function more() {
    if (!next) return;
    setLoading(true);
    try {
      const data = await api<{ items: HistoryItem[]; nextBefore: string | null }>(`/api/history?before=${encodeURIComponent(next)}`);
      setItems((i) => [...i, ...data.items]);
      setNext(data.nextBefore);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't load more.", "high");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this rewrite permanently? This can't be undone.")) return;
    try {
      await api(`/api/history/${id}`, { method: "DELETE" });
      setItems((i) => i.filter((x) => x.id !== id));
      toast("Deleted.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete.", "high");
    }
  }

  const shown = q ? items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())) : items;

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
        <FileText className="mx-auto size-8 text-muted" />
        <p className="mt-3 font-medium">No rewrites yet</p>
        <p className="mt-1 text-sm text-muted">Your saved rewrites will appear here. Private-mode rewrites are never saved.</p>
        <Link href="/app" className="mt-5 inline-flex h-10 items-center rounded-xl bg-forest px-4 text-sm font-medium text-canvas dark:text-[#0b1a10]">
          Start writing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles…"
        aria-label="Search history"
        className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-forest focus:outline-none sm:max-w-xs"
      />
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sunken/50 sm:px-5">
            <Link href={`/app/history/${item.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium text-ink">{item.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{when(item.createdAt)}</span>
                <span>{MODES[item.mode as Mode]?.label ?? item.mode}</span>
                <span>
                  {item.wordsIn.toLocaleString()} → {item.wordsOut.toLocaleString()} words
                </span>
                {item.highRisk > 0 ? (
                  <Badge tone="high">
                    <TriangleAlert className="size-3" /> {item.highRisk} high-risk
                  </Badge>
                ) : item.flagged > 0 ? (
                  <Badge tone="medium">{item.flagged} flagged</Badge>
                ) : (
                  <Badge tone="good">No flags</Badge>
                )}
              </div>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => remove(item.id)} aria-label={`Delete ${item.title}`}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      {next && !q && (
        <div className="text-center">
          <Button variant="secondary" onClick={more} loading={loading}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
