import { useId, type ReactNode } from "react";

import { formatNumber } from "@/components/map/drive-result";
import type { ProfilePoint } from "@/lib/mars/compare-routes";

import { profileSummary, type ProfileChart } from "../route-comparison";

// The plot's own units: the SVG stretches to the panel width, so lines use non-scaling strokes.
const WIDTH = 100;
const HEIGHT = 40;

/**
 * Height (or slope) along the way out of the safest route, with the shortest overlaid when shown.
 * Steps on ground over the caution slope are drawn thicker in the caution colour, and the text
 * under the plot gives the same numbers for screen readers.
 */
export function RouteProfile({
  chart,
  routeColor,
  showShortest,
}: {
  chart: ProfileChart;
  /** The safest route's map colour, so the line reads as the same route. */
  routeColor: string;
  showShortest: boolean;
}) {
  const titleId = useId();
  const summaryId = useId();
  const shortest = showShortest ? chart.shortest : null;
  const shown = shortest ? [chart.safest, shortest] : [chart.safest];
  const value = (point: ProfilePoint) =>
    chart.measure === "height" ? point.height_m : point.slope_deg;
  const values = shown.flat().map(value);
  // A slope plot starts at 0° and always reaches the caution line, so it shows how close the route gets.
  const low = chart.measure === "slope" ? 0 : Math.min(...values);
  const high =
    chart.measure === "slope" ? Math.max(...values, chart.cautionDeg * 1.2) : Math.max(...values);
  const span = high - low || 1; // a flat route still gets a line, along the bottom
  const lengthM = Math.max(...shown.map((points) => points.at(-1)?.distance_m ?? 0)) || 1;
  const x = (point: ProfilePoint) => (point.distance_m / lengthM) * WIDTH;
  const y = (v: number) => HEIGHT - ((v - low) / span) * HEIGHT;
  // Units written as in the readouts: "−4069 m", "17.2°".
  const tick = (v: number) =>
    chart.measure === "height" ? `${formatNumber(v, 0)} m` : `${formatNumber(v, 1)}°`;

  /** "M x y L x y …" through the points, or only through the steps on steep ground. */
  const path = (points: ProfilePoint[], steepOnly = false) =>
    points
      .map((point, i) => {
        const steep =
          i > 0 && Math.max(point.slope_deg, points[i - 1].slope_deg) > chart.cautionDeg;
        const command = i === 0 || (steepOnly && !steep) ? "M" : "L";
        return `${command}${x(point).toFixed(2)} ${y(value(point)).toFixed(2)}`;
      })
      .join(" ");

  return (
    <figure className="flex flex-col gap-1">
      <figcaption id={titleId} className="text-xs font-medium">
        {chart.title}
      </figcaption>
      <div className="flex gap-1.5">
        <div
          aria-hidden
          className="flex w-14 shrink-0 flex-col justify-between text-right font-mono text-xs text-muted-foreground tabular-nums"
        >
          <span>{tick(high)}</span>
          <span>{tick(low)}</span>
        </div>
        <svg
          role="img"
          aria-labelledby={`${titleId} ${summaryId}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-20 w-full border-b border-l border-border"
        >
          {chart.measure === "slope" && (
            <line
              x1={0}
              x2={WIDTH}
              y1={y(chart.cautionDeg)}
              y2={y(chart.cautionDeg)}
              stroke="var(--warning)"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {shortest && (
            <path
              d={path(shortest)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={path(chart.safest)}
            fill="none"
            stroke={routeColor}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {shown.map((points, i) => (
            <path
              key={i}
              d={path(points, true)}
              fill="none"
              stroke="var(--warning)"
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div
        aria-hidden
        className="ml-15.5 flex justify-between font-mono text-xs text-muted-foreground tabular-nums"
      >
        <span>0 km</span>
        <span>{formatNumber(lengthM / 1000, 2)} km out</span>
      </div>
      <div aria-hidden className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <LegendSwatch className="border-t-2" color={routeColor}>
          Safest
        </LegendSwatch>
        {shortest && (
          <LegendSwatch className="border-t-2 border-dashed" color="var(--muted-foreground)">
            Shortest
          </LegendSwatch>
        )}
        <LegendSwatch className="border-t-4" color="var(--warning)">
          Over {chart.cautionDeg}° (caution)
        </LegendSwatch>
      </div>
      <p id={summaryId} className="text-xs">
        Safest: {profileSummary(chart.safest, chart)}.
        {shortest && ` Shortest: ${profileSummary(shortest, chart)}.`}
      </p>
    </figure>
  );
}

function LegendSwatch({
  className,
  color,
  children,
}: {
  className: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={`w-4 forced-color-adjust-none ${className}`}
        style={{ borderColor: color }}
      />
      {children}
    </span>
  );
}
