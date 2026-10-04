"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Download, Feather, KeyRound, ShieldCheck, Trash2, User } from "lucide-react";
import { Button, Card, Label, inputClass, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import { VoiceSettings } from "./VoiceSettings";

function Section({ icon: Icon, title, description, children }: { icon: typeof User; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-forest-soft text-forest">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function SettingsForms({ name, email, voiceSample, voicePhrases }: { name: string; email: string; voiceSample: string | null; voicePhrases: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast(success);
      router.refresh();
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong.", "high");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Section icon={User} title="Profile" description={`Signed in as ${email}`}>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("name") ?? "");
            void act("name", () => api("/api/account", { method: "PATCH", body: { name: v } }), "Name updated.");
          }}
        >
          <div className="flex-1">
            <Label htmlFor="name">Display name</Label>
            <input id="name" name="name" defaultValue={name} required maxLength={100} className={inputClass} />
          </div>
          <Button type="submit" loading={busy === "name"}>
            Save
          </Button>
        </form>
      </Section>

      <Section
        icon={Feather}
        title="Your writing voice"
        description="Add 300 or more words you wrote yourself, such as an essay, report or blog post. PanPen measures how you write so rewrites keep your words, rhythm and expressions. It's encrypted and never used to train models."
      >
        <VoiceSettings voiceSample={voiceSample} voicePhrases={voicePhrases} />
      </Section>

      <Section icon={KeyRound} title="Password" description="Changing your password signs you out on all other devices.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const ok = await act(
              "pw",
              () => api("/api/account/password", { body: { currentPassword: fd.get("current"), newPassword: fd.get("new") } }),
              "Password changed.",
            );
            if (ok) form.reset();
          }}
        >
          <div>
            <Label htmlFor="current">Current password</Label>
            <input id="current" name="current" type="password" required autoComplete="current-password" className={inputClass} />
          </div>
          <div>
            <Label htmlFor="new" hint="10+ characters">
              New password
            </Label>
            <input id="new" name="new" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === "pw"}>
              Change password
            </Button>
          </div>
        </form>
      </Section>

      <Section
        icon={ShieldCheck}
        title="Privacy & your data"
        description="Documents are encrypted at rest (AES-256-GCM) and sent to OpenAI only for processing, with storage disabled. Citations, quotations, statistics and — if you choose — personal details are masked before they leave PanPen."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/api/account/export" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-sunken">
            <Download className="size-4" /> Download all my data
          </a>
          <Button
            variant="danger"
            loading={busy === "delete"}
            onClick={async () => {
              const pw = prompt("This permanently deletes your account, history and writing sample. Enter your password to confirm:");
              if (!pw) return;
              const ok = await act("delete", () => api("/api/account", { method: "DELETE", body: { password: pw } }), "Your account has been deleted.");
              if (ok) router.replace("/");
            }}
          >
            <Trash2 className="size-4" /> Delete my account
          </Button>
        </div>
      </Section>
    </div>
  );
}
