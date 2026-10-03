import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { headers } from "next/headers";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Preader — Pan-African humanized writing", template: "%s · Preader" },
  description:
    "Turn rough or AI-assisted drafts into natural, culturally aware prose that keeps your meaning, facts, citations and voice. Built for African students, researchers and professionals.",
  applicationName: "Preader",
  authors: [{ name: "Tolbert Innovation Hub" }],
  creator: "Tolbert Innovation Hub",
  publisher: "Tolbert Innovation Hub",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers opts every page into dynamic rendering, which the per-request CSP nonce requires.
  await headers();
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
