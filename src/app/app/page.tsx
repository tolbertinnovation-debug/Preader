import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { resolveOptions } from "@/lib/preferences";

export const metadata: Metadata = { title: "Write" };

export default async function WritePage() {
  const user = await requireUser();
  return <Workspace defaults={resolveOptions(user.preferences)} hasVoiceSample={user.hasVoiceSample} maxWords={env.maxWordsPerRequest} />;
}
