"use client";

import { useState } from "react";
import { MoveHorizontal } from "lucide-react";

/** Drag (or use arrow keys) to reveal the original on the left and the result on the right. */
export function CompareSlider({ before, after, width, height }: { before: string; after: string; width: number; height: number }) {
  const [pos, setPos] = useState(50);
  return (
    <div
      className="relative mx-auto w-full select-none overflow-hidden rounded-2xl bg-sunken"
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: "72vh", maxWidth: `calc(72vh * ${width / height})` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URLs */}
      <img src={after} alt="Humanized result" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URLs */}
      <img
        src={before}
        alt="Original upload"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
        <div className="absolute top-1/2 -ml-5 -mt-5 flex size-10 items-center justify-center rounded-full bg-white text-[#1d1a16] shadow-lg">
          <MoveHorizontal className="size-5" />
        </div>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-forest/90 px-2.5 py-1 text-xs font-semibold text-white">After</span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
