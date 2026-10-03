import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="font-serif text-3xl font-semibold">Page not found</h1>
      <p className="text-muted">That page doesn&apos;t exist, or it may have been deleted.</p>
      <Link href="/" className="font-medium text-forest hover:underline">
        Go home
      </Link>
    </main>
  );
}
