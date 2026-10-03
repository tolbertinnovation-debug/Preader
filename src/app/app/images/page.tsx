import type { Metadata } from "next";
import { ImageHumanizer } from "@/components/images/ImageHumanizer";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { imagesUsedToday } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Image Humanizer" };

export default async function ImagesPage() {
  const user = await requireUser();
  return <ImageHumanizer used={await imagesUsedToday(user.id)} limit={env.imageDailyLimit} />;
}
