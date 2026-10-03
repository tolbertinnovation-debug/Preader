import "server-only";
import { env } from "../env";
import type { EmailMessage } from "./templates";

export type EmailProvider = "resend" | "smtp" | "console" | "none";

/** Resend if RESEND_API_KEY is set, else SMTP if SMTP_URL is set; development falls back to logging. */
export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return env.isProd ? "none" : "console";
}

export function emailConfigured(): boolean {
  return emailProvider() !== "none";
}

function from(): string {
  return process.env.EMAIL_FROM || "Preader <no-reply@localhost>";
}

let smtp: import("nodemailer").Transporter | null = null;

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const provider = emailProvider();
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    return;
  }
  if (provider === "smtp") {
    if (!smtp) {
      const nodemailer = await import("nodemailer");
      smtp = nodemailer.createTransport(process.env.SMTP_URL!);
    }
    await smtp.sendMail({ from: from(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return;
  }
  if (provider === "console") {
    // Development only: print the message so links can be followed without a mail server.
    console.info(`[preader] email to ${msg.to} — ${msg.subject}\n${msg.text}`);
    return;
  }
  throw new Error("Email is not configured");
}
