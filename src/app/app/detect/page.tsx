import type { Metadata } from "next";
import { Detector } from "@/components/detect/Detector";
import { requireUser } from "@/lib/auth/session";
import { GPTZERO_NAME, SIGHTENGINE_NAME, gptZeroConfigured, sightengineConfigured } from "@/lib/detect/providers";
import { env } from "@/lib/env";
import { detectionsToday } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "AI Content Detector" };

export default async function DetectPage() {
  const user = await requireUser();
  return (
    <Detector
      used={await detectionsToday(user.id)}
      limit={env.detectDailyLimit}
      maxImageMb={Math.round(env.detectMaxImageBytes / 1024 / 1024)}
      textModel={gptZeroConfigured() ? GPTZERO_NAME : null}
      imageModel={sightengineConfigured() ? SIGHTENGINE_NAME : null}
    />
  );
}
