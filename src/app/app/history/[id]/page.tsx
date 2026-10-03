import type { Metadata } from "next";
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
