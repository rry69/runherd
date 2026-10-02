"use client";

/** @deprecated Duplikat mati — pakai `@/components/BorderGlow` + `components/BorderGlow.css`. File ini tak diimport siapa pun. */

import { useCallback, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BorderGlowProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
}

const EDGE_SENSITIVITY = 30;
const FILL_OPACITY = 0.5;

const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function parseHSL(hslStr: string) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 252, s: 89, l: 65 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

function buildGradientVars(colors: string[]) {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars["--gradient-base"] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function isLightColor(color: string) {
  const value = color.trim().replace("#", "");
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false;
  const hex = value.length === 3 ? value.split("").map((ch) => ch + ch).join("") : value;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r * 0.2126 + g * 0.7152 + b * 0.0722 > 180;
}

export function BorderGlow({
  children,
  className,
  glowColor = "252 89 65",
  backgroundColor = "#0F0E17",
  borderRadius = 16,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = true,
  colors = ["#7F5AF2", "#2A2456", "#B794FF"],
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const getCenterOfElement = useCallback((el: HTMLElement) => {
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2] as const;
  }, []);

  const getEdgeProximity = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      let kx = Infinity;
      let ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement]
  );

  const getCursorAngle = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return 0;
      const radians = Math.atan2(dy, dx);
      let degrees = (radians * (180 / Math.PI) + 90) % 360;
      if (degrees < 0) degrees += 360;
      return degrees;
    },
    [getCenterOfElement]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const edge = getEdgeProximity(card, x, y);
      const angle = getCursorAngle(card, x, y);
      card.style.setProperty("--edge-proximity", `${(edge * 100).toFixed(3)}`);
      card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
      card.style.setProperty("--mx", `${x.toFixed(1)}px`);
      card.style.setProperty("--my", `${y.toFixed(1)}px`);
    },
    [getEdgeProximity, getCursorAngle]
  );

  const safeColors = colors.length > 0 ? colors : ["#7F5AF2", "#2A2456", "#B794FF"];
  const lightSurface = isLightColor(backgroundColor);

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      className={cn(
        "border-glow-card",
        lightSurface && "border-glow-card--light",
        animated && "sweep-active",
        className
      )}
      style={
        {
          "--card-bg": backgroundColor,
          "--edge-sensitivity": EDGE_SENSITIVITY,
          "--border-radius": `${borderRadius}px`,
          "--glow-padding": `${glowRadius}px`,
          "--cone-spread": coneSpread,
          "--fill-opacity": FILL_OPACITY,
          ...buildGlowVars(glowColor, glowIntensity),
          ...buildGradientVars(safeColors),
        } as CSSProperties
      }
    >
      <span className="edge-light" aria-hidden />
      <div className="border-glow-inner">{children}</div>
      <div className="spotlight" aria-hidden />
      <style>{`
        @property --edge-proximity { syntax: '<number>'; inherits: false; initial-value: 0; }
        @property --cursor-angle { syntax: '<angle>'; inherits: false; initial-value: 45deg; }
        .border-glow-card {
          --edge-proximity: 0;
          --cursor-angle: 45deg;
          --edge-sensitivity: ${EDGE_SENSITIVITY};
          --color-sensitivity: calc(var(--edge-sensitivity) + 20);
          --border-radius: ${borderRadius}px;
          --glow-padding: ${glowRadius}px;
          --cone-spread: ${coneSpread};
          position: relative;
          border-radius: var(--border-radius);
          isolation: isolate;
          transform: translate3d(0, 0, 0.01px);
          display: grid;
          border: 1px solid rgb(255 255 255 / 15%);
          background: var(--card-bg, #0F0E17);
          background: color-mix(in srgb, var(--card-bg, #0F0E17) 68%, transparent);
          overflow: visible;
          box-shadow:
            rgba(0, 0, 0, 0.1) 0px 1px 2px,
            rgba(0, 0, 0, 0.1) 0px 2px 4px,
            rgba(0, 0, 0, 0.1) 0px 4px 8px,
            rgba(0, 0, 0, 0.1) 0px 8px 16px,
            rgba(0, 0, 0, 0.1) 0px 16px 32px,
            rgba(0, 0, 0, 0.1) 0px 32px 64px;
        }
        .border-glow-card--light {
          border-color: rgb(24 24 27 / 12%);
          box-shadow:
            rgb(24 24 27 / 4%) 0 1px 2px,
            rgb(24 24 27 / 5%) 0 8px 24px;
        }
        .border-glow-card--light::after,
        .border-glow-card--light > .edge-light { mix-blend-mode: normal; }
        .border-glow-card::before,
        .border-glow-card::after,
        .border-glow-card > .edge-light {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          transition: opacity 0.25s ease-out;
          z-index: -1;
        }
        .border-glow-card:not(:hover):not(.sweep-active)::before,
        .border-glow-card:not(:hover):not(.sweep-active)::after,
        .border-glow-card:not(:hover):not(.sweep-active) > .edge-light {
          opacity: 0;
          transition: opacity 0.75s ease-in-out;
        }
        .border-glow-card::before {
          border: 1px solid transparent;
          background:
            linear-gradient(var(--card-bg, #0F0E17) 0 100%) padding-box,
            linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box,
            var(--gradient-one) border-box,
            var(--gradient-two) border-box,
            var(--gradient-three) border-box,
            var(--gradient-four) border-box,
            var(--gradient-five) border-box,
            var(--gradient-six) border-box,
            var(--gradient-seven) border-box,
            var(--gradient-base) border-box;
          opacity: calc((var(--edge-proximity) - var(--color-sensitivity)) / (100 - var(--color-sensitivity)));
          mask-image: conic-gradient(
            from var(--cursor-angle) at center,
            black calc(var(--cone-spread) * 1%),
            transparent calc((var(--cone-spread) + 15) * 1%),
            transparent calc((100 - var(--cone-spread) - 15) * 1%),
            black calc((100 - var(--cone-spread)) * 1%)
          );
        }
        .border-glow-card::after {
          border: 1px solid transparent;
          background:
            var(--gradient-one) padding-box,
            var(--gradient-two) padding-box,
            var(--gradient-three) padding-box,
            var(--gradient-four) padding-box,
            var(--gradient-five) padding-box,
            var(--gradient-six) padding-box,
            var(--gradient-seven) padding-box,
            var(--gradient-base) padding-box;
          mask-image:
            linear-gradient(to bottom, black, black),
            radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%),
            radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%),
            radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%),
            radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%),
            radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%),
            conic-gradient(from var(--cursor-angle) at center, transparent 5%, black 15%, black 85%, transparent 95%);
          mask-composite: subtract, add, add, add, add, add;
          opacity: calc(var(--fill-opacity, 0.5) * (var(--edge-proximity) - var(--color-sensitivity)) / (100 - var(--color-sensitivity)));
          mix-blend-mode: soft-light;
        }
        .border-glow-card > .edge-light {
          inset: calc(var(--glow-padding) * -1);
          pointer-events: none;
          z-index: 1;
          mask-image: conic-gradient(
            from var(--cursor-angle) at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%
          );
          opacity: calc((var(--edge-proximity) - var(--edge-sensitivity)) / (100 - var(--edge-sensitivity)));
          mix-blend-mode: plus-lighter;
        }
        .border-glow-card > .edge-light::before {
          content: "";
          position: absolute;
          inset: var(--glow-padding);
          border-radius: inherit;
          box-shadow:
            inset 0 0 0 1px var(--glow-color, hsl(252deg 89% 65% / 100%)),
            inset 0 0 1px 0 var(--glow-color-60),
            inset 0 0 3px 0 var(--glow-color-50),
            inset 0 0 6px 0 var(--glow-color-40),
            inset 0 0 15px 0 var(--glow-color-30),
            inset 0 0 25px 2px var(--glow-color-20),
            inset 0 0 50px 2px var(--glow-color-10),
            0 0 1px 0 var(--glow-color-60),
            0 0 3px 0 var(--glow-color-50),
            0 0 6px 0 var(--glow-color-40),
            0 0 15px 0 var(--glow-color-30),
            0 0 25px 2px var(--glow-color-20),
            0 0 50px 2px var(--glow-color-10);
        }
        .border-glow-inner {
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: auto;
          z-index: 1;
          background: transparent;
        }
        .border-glow-card > .spotlight {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          border-radius: inherit;
          background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(127, 90, 242, 0.35), rgba(127, 90, 242, 0.08) 45%, transparent 70%);
          mix-blend-mode: screen;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .border-glow-card:hover .spotlight { opacity: 1; }
        .border-glow-card.sweep-active { animation: border-glow-sweep 4s cubic-bezier(0.22, 1, 0.36, 1) 1; }
        @keyframes border-glow-sweep {
          0% { --edge-proximity: 0; --cursor-angle: 110deg; }
          12.5% { --edge-proximity: 100; --cursor-angle: 180deg; }
          37.5% { --edge-proximity: 100; --cursor-angle: 287deg; }
          62.5% { --edge-proximity: 100; --cursor-angle: 380deg; }
          100% { --edge-proximity: 0; --cursor-angle: 465deg; }
        }
        @media (prefers-reduced-motion: reduce) {
          .border-glow-card, .border-glow-card::before, .border-glow-card::after, .border-glow-card > .edge-light { transition: none; }
          .border-glow-card.sweep-active { animation: none; }
        }
      `}</style>
    </div>
  );
}
