import type { Metadata } from "next";
import { ImageHumanizer } from "@/components/images/ImageHumanizer";
import { Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { IMAGE_UNAVAILABLE_MESSAGE, imageEditingAvailable } from "@/lib/images/provider";
import { imagesUsedToday } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Image Humanizer" };

export default async function ImagesPage() {
  const user = await requireUser();
  if (!imageEditingAvailable()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="mb-4 text-2xl font-semibold">Image Humanizer</h1>
        <Alert tone="medium">{IMAGE_UNAVAILABLE_MESSAGE} Writing, the flyer designer and the AI Content Detector all still work.</Alert>
      </main>
    );
  }
  return <ImageHumanizer used={await imagesUsedToday(user.id)} limit={env.imageDailyLimit} />;
}
