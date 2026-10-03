import { redirect } from "next/navigation";
import { AppNav } from "@/components/app/AppNav";
import { PoweredBy } from "@/components/powered-by";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { wordsUsedToday } from "@/lib/rate-limit";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const used = await wordsUsedToday(user.id);
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <AppNav name={user.name} used={used} limit={env.dailyWordLimit} />
      {children}
      <footer className="mx-auto flex max-w-[1600px] justify-center px-4 pb-6 pt-2 sm:px-6">
        <PoweredBy />
      </footer>
    </div>
  );
}
