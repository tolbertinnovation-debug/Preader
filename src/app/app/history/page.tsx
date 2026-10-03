import type { Metadata } from "next";
import { HistoryList } from "@/components/app/HistoryList";
import { requireUser } from "@/lib/auth/session";
import { listRewrites } from "@/lib/history";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireUser();
  const items = await listRewrites(user.id, { limit: 20 });
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">History</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Every saved rewrite is encrypted at rest. Open one to review, adjust and export it again.</p>
      <HistoryList initial={items} initialNext={items.length === 20 ? items.at(-1)!.createdAt : null} />
    </main>
  );
}
