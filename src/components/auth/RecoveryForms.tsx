"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Alert, Button, Label, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    try {
      await api("/api/auth/forgot", { body: { email } });
      setSentTo(email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center" role="status">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-forest-soft text-forest">
          <MailCheck className="size-6" />
        </div>
        <h2 className="font-serif text-xl font-semibold">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          If an account exists for <strong className="text-ink">{sentTo}</strong>, we&apos;ve sent a link to reset your password. It expires in 30 minutes.
        </p>
        <p className="mt-3 text-xs text-muted">Nothing arrived after a few minutes? Check your spam folder, then try again.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
          <Link href="/login" className="text-sm font-medium text-forest hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="email">Email</Label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} placeholder="you@university.edu" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-forest hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/reset", { body: { token, password } });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="password" hint="10+ characters, letters and numbers">
          New password
        </Label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" className={`${inputClass} pr-11`} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <input id="confirm" name="confirm" type={show ? "text" : "password"} required minLength={10} autoComplete="new-password" className={inputClass} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Set new password
      </Button>
      <p className="text-center text-xs text-muted">You&apos;ll be signed out everywhere else and signed in here.</p>
    </form>
  );
}
