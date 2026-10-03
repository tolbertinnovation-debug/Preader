"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-3xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-muted">We hit an unexpected problem. Your saved work is safe — please try again.</p>
      <button onClick={reset} className="h-10 rounded-xl bg-forest px-4 text-sm font-medium text-canvas">
        Try again
      </button>
    </main>
  );
}
