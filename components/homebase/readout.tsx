"use client";

import { formatNumber } from "@/lib/mission/format";

/** One real value, one text node. Motion never introduces substitute digits or glyph reels. */
export function Readout({
  value,
  decimals,
  unit,
  revealKey,
}: {
  value: number | null;
  decimals: number;
  unit: string;
  revealKey: number;
}) {
  const text = value === null ? "No data" : formatNumber(value, decimals);
  const overflow = value !== null && text.length > 6;
  const display = overflow
    ? `${value! < 0 ? "−" : ""}${"*".repeat(6 - (value! < 0 ? 1 : 0) - (decimals ? decimals + 1 : 0))}${decimals ? `.${"*".repeat(decimals)}` : ""}`
    : text;
  return (
    <div
      className="hb-readout"
      role="img"
      data-overflow={overflow || undefined}
      aria-label={
        value === null ? "No data" : `${text} ${unit}${overflow ? ", display overflow" : ""}`
      }
    >
      <span className="hb-digits" aria-hidden key={revealKey}>
        {value === null ? <span className="hb-no-data">No data</span> : display}
      </span>
      <span className="hb-unit" aria-hidden>
        {unit}
      </span>
    </div>
  );
}
