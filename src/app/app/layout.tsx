import { redirect } from "next/navigation";
import { AppNav } from "@/components/app/AppNav";
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
    </div>
  );
}
