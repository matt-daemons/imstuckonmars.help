"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { skyPoints, skyPosition } from "@/lib/mars/starfield";
import { skyBlend } from "@/lib/mars/sky";

const stars = skyPoints(2200);
const galaxies = [
  { longitude: -157, latitude: 69, brightness: 0.8 },
  { longitude: -207, latitude: 27, brightness: 0.6 },
  ...skyPoints(24, 9182),
];

/** Camera-linked artwork only. It never drives lighting, weather or mission time. */
export function SpaceBackdrop({
  map,
  enabled = true,
}: {
  map: MapLibreMap | null;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const alpha = 1 - skyBlend(map?.getZoom() ?? 1.5);
      if (alpha <= 0) return;
      const center = map?.getCenter();
      const camera = {
        longitude: center?.lng ?? -176,
        latitude: (center?.lat ?? 46) - (map?.getPitch() ?? 0) * 0.4,
        bearing: map?.getBearing() ?? 0,
        width,
        height,
      };
      for (const galaxy of galaxies) {
        const position = skyPosition(galaxy, camera);
        if (!position) continue;
        context.save();
        context.translate(position.x, position.y);
        context.rotate((galaxy.longitude * Math.PI) / 180);
        context.scale(1, 0.28);
        const haze = context.createRadialGradient(0, 0, 0, 0, 0, 45);
        haze.addColorStop(0, `rgba(215,220,235,${alpha * 0.42})`);
        haze.addColorStop(0.12, `rgba(170,185,210,${alpha * 0.18})`);
        haze.addColorStop(0.45, `rgba(150,170,200,${alpha * 0.08})`);
        haze.addColorStop(1, "rgba(110,130,170,0)");
        context.fillStyle = haze;
        context.fillRect(-45, -45, 90, 90);
        context.restore();
      }
      for (const star of stars) {
        const position = skyPosition(star, camera);
        if (
          !position ||
          position.x < -2 ||
          position.y < -2 ||
          position.x > width + 2 ||
          position.y > height + 2
        )
          continue;
        const radius = star.brightness > 0.97 ? 1.2 : 0.45 + star.brightness * 0.35;
        context.fillStyle = `rgba(220,230,245,${alpha * (0.18 + star.brightness * 0.65)})`;
        context.beginPath();
        context.arc(position.x, position.y, radius, 0, Math.PI * 2);
        context.fill();
      }
      const sun = skyPosition({ longitude: -140, latitude: 58 }, camera);
      if (sun) {
        const glow = context.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, 70);
        glow.addColorStop(0, `rgba(255,244,213,${alpha})`);
        glow.addColorStop(0.09, `rgba(255,235,180,${alpha * 0.9})`);
        glow.addColorStop(0.2, `rgba(255,210,130,${alpha * 0.22})`);
        glow.addColorStop(1, "rgba(255,190,110,0)");
        context.fillStyle = glow;
        context.fillRect(sun.x - 70, sun.y - 70, 140, 140);
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    map?.on("move", draw);
    draw();
    return () => {
      observer.disconnect();
      map?.off("move", draw);
    };
  }, [map, enabled]);
  return enabled ? (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="space-backdrop absolute inset-0 h-full w-full pointer-events-none"
    />
  ) : null;
}
