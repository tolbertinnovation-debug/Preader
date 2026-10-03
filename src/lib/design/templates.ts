// PanPen Design: template, format and theme definitions shared by the editor and renderer.

export const FORMATS = {
  square: { label: "Square post", hint: "Facebook & Instagram feed", width: 1080, height: 1080 },
  portrait: { label: "Portrait post", hint: "Taller feed post", width: 1080, height: 1350 },
  story: { label: "Story / Status", hint: "WhatsApp status, Stories", width: 1080, height: 1920 },
  a4: { label: "A4 print", hint: "300 dpi printed flyer", width: 2480, height: 3508 },
} as const;
export type FormatId = keyof typeof FORMATS;

export const TEMPLATES = {
  promo: { label: "Promotion", hint: "Offers, packages and prices" },
  event: { label: "Event", hint: "Date, venue and details" },
  announce: { label: "Announcement", hint: "News, notices and services" },
} as const;
export type TemplateId = keyof typeof TEMPLATES;

export type Theme = {
  label: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  /** Colours for the woven accent band. */
  weave: string[];
};

export const THEMES: Record<string, Theme> = {
  panpen: {
    label: "PanPen",
    bg: "#fbf7f0",
    surface: "#ffffff",
    ink: "#1d1a16",
    muted: "#5b544a",
    primary: "#14532d",
    onPrimary: "#ffffff",
    accent: "#c8901a",
    onAccent: "#1d1a16",
    weave: ["#c8901a", "#14532d", "#b4471f", "#1d1a16"],
  },
  royal: {
    label: "Royal",
    bg: "#f6f8fc",
    surface: "#ffffff",
    ink: "#0d1630",
    muted: "#4a5470",
    primary: "#0b2a6b",
    onPrimary: "#ffffff",
    accent: "#c8102e",
    onAccent: "#ffffff",
    weave: ["#c8102e", "#0b2a6b", "#ffffff", "#e8b400"],
  },
  clay: {
    label: "Clay",
    bg: "#fff6ea",
    surface: "#ffffff",
    ink: "#2a160c",
    muted: "#6b4b3a",
    primary: "#8a3412",
    onPrimary: "#ffffff",
    accent: "#e0a526",
    onAccent: "#2a160c",
    weave: ["#e0a526", "#8a3412", "#2f6b3a", "#2a160c"],
  },
  midnight: {
    label: "Midnight",
    bg: "#121212",
    surface: "#1e1d1b",
    ink: "#f5efe4",
    muted: "#bdb4a5",
    primary: "#d9a33a",
    onPrimary: "#121212",
    accent: "#e4572e",
    onAccent: "#ffffff",
    weave: ["#d9a33a", "#e4572e", "#2f8f5b", "#f5efe4"],
  },
};
export type ThemeId = keyof typeof THEMES;

export type PriceItem = { title: string; oldPrice: string; price: string; note: string };

export type Design = {
  template: TemplateId;
  format: FormatId;
  theme: ThemeId;
  headlineFont: "sans" | "serif";
  brand: string;
  headline: string;
  subheadline: string;
  badge: string;
  items: PriceItem[];
  bullets: string[];
  date: string;
  venue: string;
  body: string;
  cta: string;
  phone: string;
  email: string;
  website: string;
};

export const MAX_ITEMS = 4;
export const MAX_BULLETS = 6;

export const DEFAULT_DESIGN: Design = {
  template: "promo",
  format: "square",
  theme: "panpen",
  headlineFont: "sans",
  brand: "Your Organisation",
  headline: "Professional Website Solutions",
  subheadline: "Build your online presence. Grow your business.",
  badge: "50% OFF",
  items: [
    { title: "Business Website", oldPrice: "$200", price: "$100", note: "Domain, hosting & SSL" },
    { title: "Online Store", oldPrice: "$300", price: "$150", note: "Shop, cart & payments" },
  ],
  bullets: ["Mobile-friendly design", "Free domain for 1 year", "Training & support included"],
  date: "Saturday, 18 October · 10:00 AM",
  venue: "Monrovia City Hall, Monrovia",
  body: "Join us for a morning of learning, networking and celebration. Everyone is welcome.",
  cta: "Call us today",
  phone: "+231 000 000 000",
  email: "info@example.org",
  website: "example.org",
};

/** Which fields each template shows in the editor. */
export const TEMPLATE_FIELDS: Record<TemplateId, (keyof Design)[]> = {
  promo: ["brand", "headline", "subheadline", "badge", "items", "bullets", "cta", "phone", "email", "website"],
  event: ["brand", "headline", "subheadline", "date", "venue", "body", "cta", "phone", "email", "website"],
  announce: ["brand", "headline", "subheadline", "body", "bullets", "cta", "phone", "email", "website"],
};

/** Keeps stored or edited designs valid (unknown keys dropped, lists capped, strings bounded). */
export function sanitizeDesign(input: unknown): Design {
  const d = (typeof input === "object" && input !== null ? input : {}) as Partial<Design>;
  const str = (v: unknown, fallback: string, max = 200) => (typeof v === "string" ? v.slice(0, max) : fallback);
  const base = DEFAULT_DESIGN;
  return {
    template: d.template && d.template in TEMPLATES ? d.template : base.template,
    format: d.format && d.format in FORMATS ? d.format : base.format,
    theme: d.theme && d.theme in THEMES ? d.theme : base.theme,
    headlineFont: d.headlineFont === "serif" ? "serif" : "sans",
    brand: str(d.brand, base.brand, 80),
    headline: str(d.headline, base.headline, 120),
    subheadline: str(d.subheadline, base.subheadline, 160),
    badge: str(d.badge, base.badge, 16),
    items: Array.isArray(d.items)
      ? d.items.slice(0, MAX_ITEMS).map((i) => ({
          title: str(i?.title, "", 60),
          oldPrice: str(i?.oldPrice, "", 16),
          price: str(i?.price, "", 16),
          note: str(i?.note, "", 80),
        }))
      : base.items,
    bullets: Array.isArray(d.bullets) ? d.bullets.slice(0, MAX_BULLETS).map((b) => str(b, "", 80)) : base.bullets,
    date: str(d.date, base.date, 80),
    venue: str(d.venue, base.venue, 100),
    body: str(d.body, base.body, 400),
    cta: str(d.cta, base.cta, 40),
    phone: str(d.phone, base.phone, 40),
    email: str(d.email, base.email, 80),
    website: str(d.website, base.website, 80),
  };
}
