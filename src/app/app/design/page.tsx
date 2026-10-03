import type { Metadata } from "next";
import { FlyerMaker } from "@/components/design/FlyerMaker";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Design" };

export default async function DesignPage() {
  await requireUser();
  return <FlyerMaker />;
}
