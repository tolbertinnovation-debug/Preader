// Draws a PanPen Design onto a canvas at full output resolution. Pure canvas 2D, no AI.
import { FORMATS, THEMES, type Design, type Theme } from "@/lib/design/templates";

export type Assets = { logo: ImageBitmap | null; photo: ImageBitmap | null };
export type Fonts = { sans: string; serif: string };

type Ctx = CanvasRenderingContext2D;

/* ── Primitives ───────────────────────────────────────────────────────── */

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function setFont(ctx: Ctx, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${Math.max(1, Math.round(size))}px ${family}`;
}

/** Word-wraps text to maxWidth; very long words are broken by character. */
export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
      } else {
        let chunk = "";
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
    }
    lines.push(line);
  }
  return lines.filter((l, i, a) => l || (i > 0 && i < a.length - 1));
}

/** Largest font size (from start down to min) at which text fits in maxLines; ellipsis as a last resort. */
function fitText(ctx: Ctx, text: string, maxWidth: number, maxLines: number, start: number, min: number, weight: number, family: string) {
  for (let size = start; size >= min; size -= Math.max(1, start * 0.04)) {
    setFont(ctx, weight, size, family);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  setFont(ctx, weight, min, family);
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
  if (lines.length) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return { size: min, lines };
}

function drawLines(ctx: Ctx, lines: string[], x: number, y: number, lineHeight: number, align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function drawImage(ctx: Ctx, img: ImageBitmap, x: number, y: number, w: number, h: number, mode: "cover" | "contain", radius = 0) {
  const scale = mode === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  // Always clip: "cover" scales the image beyond its box.
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function weave(ctx: Ctx, x: number, y: number, w: number, h: number, colors: string[], u: number) {
  const widths = [34, 10, 10, 6].map((n) => n * u);
  let cx = x;
  let i = 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  while (cx < x + w) {
    ctx.fillStyle = colors[i % colors.length]!;
    const bw = widths[i % widths.length]!;
    ctx.fillRect(cx, y, bw + 0.5, h);
    cx += bw;
    i++;
  }
  ctx.restore();
}

function check(ctx: Ctx, x: number, y: number, size: number, bg: string, fg: string) {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.28, y + size * 0.52);
  ctx.lineTo(x + size * 0.44, y + size * 0.67);
  ctx.lineTo(x + size * 0.73, y + size * 0.35);
  ctx.stroke();
}

/* ── Flexible middle section ─────────────────────────────────────────── */

type Block = { height: (s: number) => number; draw: (y: number, s: number) => void; gap: number; optional?: boolean };

/** Fits blocks between top and bottom, shrinking them (and dropping optional ones) when space is short. */
function layoutBlocks(blocks: Block[], top: number, bottom: number, center = true) {
  const avail = bottom - top;
  let active = blocks.filter((b) => b.height(1) > 0);
  const total = (s: number, list: Block[]) => list.reduce((n, b, i) => n + b.height(s) + (i ? b.gap * s : 0), 0);
  let s = 1;
  while (total(s, active) > avail && s > 0.6) s -= 0.04;
  while (total(s, active) > avail && active.some((b) => b.optional)) {
    const idx = active.map((b) => !!b.optional).lastIndexOf(true);
    active = active.filter((_, i) => i !== idx);
  }
  let y = top + (center ? Math.max(0, (avail - total(s, active)) / 2) : 0);
  active.forEach((b, i) => {
    if (i) y += b.gap * s;
    b.draw(y, s);
    y += b.height(s);
  });
}

/* ── Shared pieces ───────────────────────────────────────────────────── */

type Env = { ctx: Ctx; d: Design; t: Theme; f: Fonts; a: Assets; W: number; H: number; u: number; pad: number };

function headlineFamily(env: Env) {
  return env.d.headlineFont === "serif" ? env.f.serif : env.f.sans;
}

function brandRow(env: Env, x: number, y: number, size: number, color: string, align: "left" | "center" = "left") {
  const { ctx, d, a, f } = env;
  const gap = size * 0.25;
  setFont(ctx, 700, size * 0.42, f.sans);
  const textW = d.brand ? Math.min(ctx.measureText(d.brand).width, env.W - env.pad * 2 - size - gap) : 0;
  const logoW = a.logo ? size : 0;
  const totalW = logoW + (logoW && textW ? gap : 0) + textW;
  let cx = align === "center" ? x - totalW / 2 : x;
  if (a.logo) {
    drawImage(ctx, a.logo, cx, y, size, size, "contain");
    cx += size + (textW ? gap : 0);
  }
  if (d.brand) {
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const { lines } = fitText(ctx, d.brand, textW + 1, 1, size * 0.42, size * 0.28, 700, f.sans);
    ctx.fillText(lines[0] ?? "", cx, y + size / 2);
  }
}

function contactBar(env: Env): number {
  const { ctx, d, t, f, W, H, u, pad } = env;
  const parts = [d.email, d.website].filter(Boolean);
  if (!d.phone && !parts.length) return H - pad * 0.6;
  const barH = (d.phone && parts.length ? 150 : 110) * u;
  const y = H - barH - 16 * u;
  ctx.fillStyle = t.primary;
  ctx.fillRect(0, y, W, barH);
  weave(ctx, 0, H - 16 * u, W, 16 * u, t.weave, u);
  ctx.fillStyle = t.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (d.phone) {
    const { size } = fitText(ctx, d.phone, W - pad * 2, 1, 50 * u, 28 * u, 800, f.sans);
    setFont(ctx, 800, size, f.sans);
    ctx.fillText(d.phone, W / 2, y + (parts.length ? barH * 0.36 : barH / 2));
  }
  if (parts.length) {
    const line = parts.join("   ·   ");
    const { size, lines } = fitText(ctx, line, W - pad * 2, 1, 30 * u, 18 * u, 500, f.sans);
    setFont(ctx, 500, size, f.sans);
    ctx.globalAlpha = 0.92;
    ctx.fillText(lines[0] ?? "", W / 2, y + (d.phone ? barH * 0.72 : barH / 2));
    ctx.globalAlpha = 1;
  }
  return y;
}

function ctaBlock(env: Env, align: "left" | "center"): Block {
  const { ctx, d, t, f, W, u, pad } = env;
  return {
    gap: 34,
    optional: true,
    height: (s) => (d.cta ? 92 * u * s : 0),
    draw: (y, s) => {
      setFont(ctx, 800, 36 * u * s, f.sans);
      const w = Math.min(ctx.measureText(d.cta).width + 88 * u * s, W - pad * 2);
      const h = 92 * u * s;
      const x = align === "center" ? (W - w) / 2 : pad;
      ctx.fillStyle = t.accent;
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = t.onAccent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const { lines } = fitText(ctx, d.cta, w - 60 * u * s, 1, 36 * u * s, 22 * u * s, 800, f.sans);
      ctx.fillText(lines[0] ?? "", x + w / 2, y + h / 2 + 1);
    },
  };
}

function bulletsBlock(env: Env, x: number, width: number): Block {
  const { ctx, d, t, f, u } = env;
  const items = d.bullets.filter(Boolean);
  const metrics = (s: number) => {
    const size = 32 * u * s;
    setFont(ctx, 500, size, f.sans);
    const iconW = size * 1.5;
    const rows = items.map((b) => wrapText(ctx, b, width - iconW));
    return { size, iconW, rows, lh: size * 1.32, rowGap: size * 0.45 };
  };
  return {
    gap: 30,
    optional: true,
    height: (s) => {
      if (!items.length) return 0;
      const m = metrics(s);
      return m.rows.reduce((n, r) => n + r.length * m.lh, 0) + (m.rows.length - 1) * m.rowGap;
    },
    draw: (y, s) => {
      const m = metrics(s);
      let cy = y;
      m.rows.forEach((lines) => {
        check(ctx, x, cy + (m.lh - m.size) / 2, m.size, t.primary, t.onPrimary);
        ctx.fillStyle = t.ink;
        setFont(ctx, 500, m.size, f.sans);
        cy = drawLines(ctx, lines, x + m.iconW, cy + (m.lh - m.size) / 2, m.lh) - (m.lh - m.size) / 2 + m.rowGap;
      });
    },
  };
}

function textBlock(env: Env, text: string, opts: { x: number; width: number; size: number; weight: number; color: string; maxLines: number; align?: CanvasTextAlign; family?: string; gap?: number; optional?: boolean }): Block {
  const { ctx, f } = env;
  const family = opts.family ?? f.sans;
  const fit = (s: number) => fitText(ctx, text, opts.width, opts.maxLines, opts.size * s, opts.size * s * 0.7, opts.weight, family);
  return {
    gap: opts.gap ?? 22,
    optional: opts.optional,
    height: (s) => (text.trim() ? fit(s).lines.length * fit(s).size * 1.3 : 0),
    draw: (y, s) => {
      const { size, lines } = fit(s);
      setFont(ctx, opts.weight, size, family);
      ctx.fillStyle = opts.color;
      const x = opts.align === "center" ? opts.x + opts.width / 2 : opts.x;
      drawLines(ctx, lines, x, y, size * 1.3, opts.align ?? "left");
    },
  };
}

function headlineBlock(env: Env, width: number, align: CanvasTextAlign, x: number, color: string): Block {
  const { ctx, d, u } = env;
  const family = headlineFamily(env);
  const weight = d.headlineFont === "serif" ? 700 : 800;
  const fit = (s: number) => fitText(ctx, d.headline, width, 3, 112 * u * s, 54 * u * s, weight, family);
  return {
    gap: 0,
    height: (s) => (d.headline.trim() ? fit(s).lines.length * fit(s).size * 1.06 : 0),
    draw: (y, s) => {
      const { size, lines } = fit(s);
      setFont(ctx, weight, size, family);
      ctx.fillStyle = color;
      drawLines(ctx, lines, align === "center" ? x + width / 2 : x, y, size * 1.06, align);
    },
  };
}

function photoBlock(env: Env, x: number, width: number, maxH: number): Block {
  const { ctx, a, u } = env;
  return {
    gap: 34,
    optional: true,
    height: (s) => (a.photo ? maxH * s : 0),
    draw: (y, s) => a.photo && drawImage(ctx, a.photo, x, y, width, maxH * s, "cover", 28 * u),
  };
}

/* ── Templates ───────────────────────────────────────────────────────── */

function drawPromo(env: Env) {
  const { ctx, d, t, f, W, H, u, pad } = env;
  weave(ctx, 0, 0, W, 18 * u, t.weave, u);
  // Soft corner shape for depth
  ctx.fillStyle = t.primary;
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(W, 0, W * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const top = 18 * u + pad * 0.8;
  brandRow(env, pad, top, 96 * u, t.ink);

  const badgeR = d.badge ? 118 * u : 0;
  if (d.badge) {
    const cx = W - pad - badgeR;
    const cy = top + badgeR + 6 * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.14);
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const r = i % 2 ? badgeR * 0.9 : badgeR;
      const ang = (i / 28) * Math.PI * 2;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = t.onAccent;
    const { size, lines } = fitText(ctx, d.badge, badgeR * 1.45, 2, 72 * u, 28 * u, 900, f.sans);
    setFont(ctx, 900, size, f.sans);
    drawLines(ctx, lines, 0, -(lines.length * size * 1.02) / 2, size * 1.02, "center");
    ctx.restore();
  }

  const contentTop = top + 96 * u + 36 * u;
  const barTop = contactBar(env);
  const width = W - pad * 2;
  const headW = width - (badgeR ? badgeR * 2 + 20 * u : 0);
  const tall = H / W > 1.15;

  const items = d.items.filter((i) => i.title || i.price);
  const cols = items.length >= 2 ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  const cardGap = 22 * u;
  const cardW = (width - cardGap * (cols - 1)) / cols;
  const cardH = (s: number) => 196 * u * s;
  const itemsBlock: Block = {
    gap: 40,
    height: (s) => (items.length ? rows * cardH(s) + (rows - 1) * cardGap * s : 0),
    draw: (y, s) => {
      items.forEach((it, i) => {
        const cx = pad + (i % cols) * (cardW + cardGap);
        const cy = y + Math.floor(i / cols) * (cardH(s) + cardGap * s);
        const h = cardH(s);
        ctx.fillStyle = t.surface;
        roundRect(ctx, cx, cy, cardW, h, 26 * u);
        ctx.fill();
        ctx.strokeStyle = t.primary;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = t.primary;
        roundRect(ctx, cx, cy, 12 * u, h, 6 * u);
        ctx.fill();
        const ix = cx + 36 * u;
        const iw = cardW - 60 * u;
        ctx.fillStyle = t.ink;
        const title = fitText(ctx, it.title, iw, 1, 36 * u * s, 22 * u * s, 800, f.sans);
        setFont(ctx, 800, title.size, f.sans);
        drawLines(ctx, title.lines, ix, cy + 24 * u * s, title.size);
        if (it.note) {
          ctx.fillStyle = t.muted;
          const note = fitText(ctx, it.note, iw, 1, 25 * u * s, 16 * u * s, 500, f.sans);
          setFont(ctx, 500, note.size, f.sans);
          drawLines(ctx, note.lines, ix, cy + 70 * u * s, note.size);
        }
        // Prices on one baseline: old (struck through) then new
        const baseY = cy + h - 26 * u * s;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        let px = ix;
        if (it.oldPrice) {
          setFont(ctx, 600, 32 * u * s, f.sans);
          ctx.fillStyle = t.muted;
          ctx.fillText(it.oldPrice, px, baseY);
          const ow = ctx.measureText(it.oldPrice).width;
          ctx.strokeStyle = t.accent;
          ctx.lineWidth = 4 * u * s;
          ctx.beginPath();
          ctx.moveTo(px - 2 * u, baseY - 11 * u * s);
          ctx.lineTo(px + ow + 2 * u, baseY - 11 * u * s);
          ctx.stroke();
          px += ow + 18 * u * s;
        }
        if (it.price) {
          const pr = fitText(ctx, it.price, ix + iw - px, 1, 64 * u * s, 30 * u * s, 900, f.sans);
          setFont(ctx, 900, pr.size, f.sans);
          ctx.fillStyle = t.primary;
          ctx.fillText(pr.lines[0] ?? "", px, baseY);
        }
      });
    },
  };

  layoutBlocks(
    [
      headlineBlock(env, headW, "left", pad, t.primary),
      textBlock(env, d.subheadline, { x: pad, width: headW, size: 38 * u, weight: 500, color: t.muted, maxLines: 2, gap: 18 }),
      photoBlock(env, pad, width, tall ? Math.min(W * 0.5, (barTop - contentTop) * 0.3) : 0),
      itemsBlock,
      bulletsBlock(env, pad, width),
      ctaBlock(env, "left"),
    ],
    contentTop,
    barTop - pad * 0.7,
    false,
  );
}

function drawEvent(env: Env) {
  const { ctx, d, t, f, W, H, u, pad, a } = env;
  const heroH = H * (H / W > 1.15 ? 0.42 : 0.4);
  if (a.photo) {
    drawImage(ctx, a.photo, 0, 0, W, heroH, "cover");
  } else {
    ctx.fillStyle = t.primary;
    ctx.fillRect(0, 0, W, heroH);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = t.onPrimary;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(W * (0.15 + i * 0.17), heroH * (i % 2 ? 0.3 : 0.75), W * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const grad = ctx.createLinearGradient(0, heroH * 0.55, 0, heroH);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, heroH);

  // Brand chip over the hero
  const chipH = 92 * u;
  const rowSize = chipH * 0.76; // brandRow draws its text at 0.42 of this
  setFont(ctx, 700, rowSize * 0.42, f.sans);
  const logoPart = a.logo ? rowSize + (d.brand ? rowSize * 0.25 : 0) : 0;
  const chipW = Math.min(W - pad * 2, 18 * u + logoPart + (d.brand ? ctx.measureText(d.brand).width : 0) + 34 * u);
  if (d.brand || a.logo) {
    ctx.fillStyle = t.surface;
    roundRect(ctx, pad, pad * 0.8, chipW, chipH, chipH / 2);
    ctx.fill();
    brandRow(env, pad + 18 * u, pad * 0.8 + chipH * 0.12, rowSize, t.ink);
  }

  // Title card overlapping the hero
  const cardX = pad * 0.6;
  const cardW = W - pad * 1.2;
  const cardTop = heroH - 90 * u;
  const barTop = contactBar(env);
  ctx.fillStyle = t.surface;
  roundRect(ctx, cardX, cardTop, cardW, barTop - cardTop - pad * 0.6, 36 * u);
  ctx.fill();
  weave(ctx, cardX + 40 * u, cardTop, 180 * u, 12 * u, t.weave, u);

  const inner = cardW - 80 * u;
  const x = cardX + 40 * u;
  const info = (label: string, value: string): Block => ({
    gap: 26,
    height: (s) => (value ? 30 * u * s + 8 * u * s + fitText(ctx, value, inner, 2, 40 * u * s, 26 * u * s, 800, f.sans).lines.length * 40 * u * s * 1.2 : 0),
    draw: (y, s) => {
      ctx.fillStyle = t.accent;
      setFont(ctx, 800, 24 * u * s, f.sans);
      drawLines(ctx, [label], x, y, 30 * u * s);
      ctx.fillStyle = t.ink;
      const v = fitText(ctx, value, inner, 2, 40 * u * s, 26 * u * s, 800, f.sans);
      setFont(ctx, 800, v.size, f.sans);
      drawLines(ctx, v.lines, x, y + 38 * u * s, v.size * 1.2);
    },
  });

  layoutBlocks(
    [
      headlineBlock(env, inner, "left", x, t.primary),
      textBlock(env, d.subheadline, { x, width: inner, size: 36 * u, weight: 500, color: t.muted, maxLines: 2, gap: 16 }),
      info("DATE & TIME", d.date),
      info("VENUE", d.venue),
      textBlock(env, d.body, { x, width: inner, size: 30 * u, weight: 400, color: t.ink, maxLines: 5, gap: 26, optional: true }),
      ctaBlock({ ...env, pad: x }, "left"),
    ],
    cardTop + 52 * u,
    barTop - pad * 0.6 - 36 * u,
    false,
  );
}

function drawAnnounce(env: Env) {
  const { ctx, d, t, W, u, pad } = env;
  weave(ctx, 0, 0, W, 18 * u, t.weave, u);
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.arc(0, env.H * 0.55, W * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const top = 18 * u + pad;
  brandRow(env, W / 2, top, 110 * u, t.ink, "center");
  const barTop = contactBar(env);
  const width = W - pad * 2;
  const tall = env.H / W > 1.15;
  const divider: Block = {
    gap: 30,
    height: () => 10 * u,
    draw: (y) => {
      ctx.fillStyle = t.accent;
      roundRect(ctx, W / 2 - 70 * u, y, 140 * u, 10 * u, 5 * u);
      ctx.fill();
    },
  };
  const bulletW = Math.min(width, 760 * u);
  layoutBlocks(
    [
      headlineBlock(env, width, "center", pad, t.primary),
      divider,
      textBlock(env, d.subheadline, { x: pad, width, size: 40 * u, weight: 600, color: t.ink, maxLines: 2, align: "center", gap: 30 }),
      photoBlock(env, pad, width, tall ? W * 0.55 : 0),
      textBlock(env, d.body, { x: pad, width, size: 32 * u, weight: 400, color: t.muted, maxLines: 6, align: "center", gap: 30, optional: true }),
      bulletsBlock(env, (W - bulletW) / 2, bulletW),
      ctaBlock(env, "center"),
    ],
    top + 110 * u + 40 * u,
    barTop - pad * 0.7,
    true,
  );
}

/* ── Entry point ─────────────────────────────────────────────────────── */

export function renderDesign(canvas: HTMLCanvasElement, d: Design, assets: Assets, fonts: Fonts) {
  const { width: W, height: H } = FORMATS[d.format];
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const t = THEMES[d.theme] ?? THEMES.panpen!;
  const u = W / 1080;
  const env: Env = { ctx, d, t, f: fonts, a: assets, W, H, u, pad: 64 * u };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  if (d.template === "event") drawEvent(env);
  else if (d.template === "announce") drawAnnounce(env);
  else drawPromo(env);
  ctx.restore();
}
