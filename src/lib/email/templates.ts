// Plain-text and HTML bodies for transactional email. Pure functions so they can be unit-tested.

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#fbf7f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1a16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f0;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7dfd1;border-radius:16px;overflow:hidden">
<tr><td style="height:6px;background:linear-gradient(90deg,#c8901a 0 30%,#14532d 30% 50%,#b4471f 50% 70%,#c8901a 70%)"></td></tr>
<tr><td style="padding:28px 28px 8px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#0b1f45">PanPen</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#7a7266;margin-top:16px">PanPen · Powered by Tolbert Innovation Hub</p>
</td></tr></table></body></html>`;
}

export function passwordResetEmail(opts: { to: string; name: string; link: string; minutes: number }): EmailMessage {
  const subject = "Reset your PanPen password";
  const text = `Hello ${opts.name},

Someone (hopefully you) asked to reset the password for your PanPen account.

Open this link to choose a new password. It works once and expires in ${opts.minutes} minutes:
${opts.link}

If you didn't ask for this, you can ignore this email — your password won't change.

— PanPen, powered by Tolbert Innovation Hub`;
  const html = layout(
    subject,
    `<p style="margin:0 0 16px">Hello ${escapeHtml(opts.name)},</p>
<p style="margin:0 0 20px">Someone (hopefully you) asked to reset the password for your PanPen account. This link works once and expires in ${opts.minutes} minutes.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#14532d;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">Choose a new password</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4a443b">Or paste this link into your browser:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${escapeHtml(opts.link)}" style="color:#14532d">${escapeHtml(opts.link)}</a></p>
<p style="margin:0;font-size:13px;color:#7a7266">If you didn't ask for this, ignore this email — your password won't change.</p>`,
  );
  return { to: opts.to, subject, text, html };
}

export function passwordChangedEmail(opts: { to: string; name: string; when: Date; resetUrl: string }): EmailMessage {
  const subject = "Your PanPen password was changed";
  const when = opts.when.toUTCString();
  const text = `Hello ${opts.name},

The password for your PanPen account was changed on ${when}. You've been signed out on your other devices.

If this wasn't you, reset your password straight away: ${opts.resetUrl}

— PanPen, powered by Tolbert Innovation Hub`;
  const html = layout(
    subject,
    `<p style="margin:0 0 16px">Hello ${escapeHtml(opts.name)},</p>
<p style="margin:0 0 16px">The password for your PanPen account was changed on ${escapeHtml(when)}. You've been signed out on your other devices.</p>
<p style="margin:0;font-size:14px">If this wasn't you, <a href="${escapeHtml(opts.resetUrl)}" style="color:#b4471f;font-weight:600">reset your password straight away</a>.</p>`,
  );
  return { to: opts.to, subject, text, html };
}
