import { describe, expect, it } from "vitest";
import { escapeHtml, passwordChangedEmail, passwordResetEmail } from "@/lib/email/templates";

describe("email templates", () => {
  it("escapes HTML in names and links", () => {
    expect(escapeHtml(`<b>"Ama" & 'Kofi'</b>`)).toBe("&lt;b&gt;&quot;Ama&quot; &amp; &#39;Kofi&#39;&lt;/b&gt;");
    const m = passwordResetEmail({ to: "a@b.org", name: "<script>x</script>", link: "https://panpen.app/reset-password?token=abc&x=1", minutes: 30 });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("token=abc&amp;x=1");
  });

  it("includes the link and expiry in the plain-text body", () => {
    const m = passwordResetEmail({ to: "a@b.org", name: "Ama", link: "https://panpen.app/reset-password?token=abc", minutes: 30 });
    expect(m.text).toContain("https://panpen.app/reset-password?token=abc");
    expect(m.text).toContain("30 minutes");
    expect(m.subject).toMatch(/reset/i);
  });

  it("tells the user where to go if the change wasn't them", () => {
    const m = passwordChangedEmail({ to: "a@b.org", name: "Ama", when: new Date("2026-10-03T10:00:00Z"), resetUrl: "https://panpen.app/forgot-password" });
    expect(m.text).toContain("https://panpen.app/forgot-password");
    expect(m.text).toContain("Sat, 03 Oct 2026");
  });
});
