import type { Metadata } from "next";
import { SettingsForms } from "@/components/app/SettingsForms";
import { requireUser } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { queryOne } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const row = await queryOne<{ voice_sample_enc: string | null }>("SELECT voice_sample_enc FROM users WHERE id = $1", [user.id]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Default style settings are saved from the writing workspace.</p>
      <SettingsForms name={user.name} email={user.email} voiceSample={row?.voice_sample_enc ? decrypt(row.voice_sample_enc) : null} />
    </main>
  );
}
