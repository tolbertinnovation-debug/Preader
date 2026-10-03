import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  if (!env.allowSignups) {
    return (
      <>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Sign-ups are closed</h1>
        <p className="mt-2 text-sm text-muted">New accounts aren&apos;t being accepted right now. Please check back soon.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Write clearly, in your own voice.</p>
      <AuthForm mode="signup" />
    </>
  );
}
