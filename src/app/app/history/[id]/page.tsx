import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getRewrite } from "@/lib/history";
import { resolveOptions } from "@/lib/preferences";

export const metadata: Metadata = { title: "Rewrite" };

export default async function HistoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const item = await getRewrite(user.id, (await params).id);
  if (!item) notFound();
  if (!item.result.summary) {
    // Saved under a previous encryption key, so its contents can't be read any more.
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">This rewrite can&apos;t be opened</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          It was saved before the site&apos;s encryption key was changed, so its contents can no longer be read. You can delete it from your history.
        </p>
        <Link href="/app/history" className="mt-6 inline-flex h-10 items-center rounded-xl bg-forest px-4 text-sm font-medium text-canvas dark:text-[#0b1a10]">
          Back to history
        </Link>
      </main>
    );
  }
  const defaults = resolveOptions(user.preferences);
  return (
    <Workspace
      key={item.id}
      defaults={defaults}
      hasVoiceSample={user.hasVoiceSample}
      maxWords={env.maxWordsPerRequest}
      initial={{
        id: item.id,
        title: item.title,
        original: item.original,
        options: { ...defaults, ...item.options, glossary: defaults.glossary },
        summary: item.result.summary,
        segments: item.result.segments.map((s) => ({ ...s, pending: false })),
      }}
    />
  );
}
