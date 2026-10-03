"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, Button, Label, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, {
        body: {
          ...(mode === "signup" ? { name: form.get("name") } : {}),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      {error && <Alert>{error}</Alert>}
      {mode === "signup" && (
        <div>
          <Label htmlFor="name">Your name</Label>
          <input id="name" name="name" required maxLength={100} autoComplete="name" className={inputClass} placeholder="e.g. Ama Mensah" />
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className={inputClass} placeholder="you@university.edu" />
      </div>
      <div>
        <Label htmlFor="password" hint={mode === "signup" ? "10+ characters, letters and numbers" : undefined}>
          Password
        </Label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            minLength={mode === "signup" ? 10 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={`${inputClass} pr-11`}
          />
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
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-forest hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Preader?{" "}
            <Link href="/signup" className="font-medium text-forest hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
