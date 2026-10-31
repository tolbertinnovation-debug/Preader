import type { Metadata } from "next";
import { AuthenticEditor } from "@/components/editor/AuthenticEditor";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { EDITOR_MAX_WORDS } from "@/lib/editor/review";

export const metadata: Metadata = { title: "Authentic Writing Editor" };

export default async function EditorPage() {
  const user = await requireUser();
  return <AuthenticEditor hasVoiceSample={user.hasVoiceSample} maxWords={Math.min(EDITOR_MAX_WORDS, env.maxWordsPerRequest)} />;
}
