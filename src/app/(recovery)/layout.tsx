import { AuthShell } from "@/components/auth/AuthShell";

// Unlike sign-in, recovery pages stay reachable while signed in (e.g. a reset link opened on a shared device).
export default function RecoveryLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
