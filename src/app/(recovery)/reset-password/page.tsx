import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/RecoveryForms";
import { resetTokenValid } from "@/lib/auth/reset";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  if (!(await resetTokenValid(token))) {
    return (
      <>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Reset links work once and last 30 minutes. If you requested more than one, only the newest works.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-forest px-6 font-medium text-canvas hover:bg-forest-strong dark:text-[#0b1a10]"
        >
          Send a new link
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Pick something you don&apos;t use anywhere else.</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
