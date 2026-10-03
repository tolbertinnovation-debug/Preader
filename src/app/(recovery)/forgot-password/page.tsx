import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/RecoveryForms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Enter the email you signed up with and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm />
    </>
  );
}
