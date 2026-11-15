import { DUST_COLORS } from "@/lib/mars/dust-field";

export function DustLegend() {
  return (
    <div
      aria-label="Simulated relative dust intensity: blue low, yellow moderate, red high"
      className="text-xs"
    >
      <div
        aria-hidden
        className="h-2"
        style={{
          background: `linear-gradient(to right, ${DUST_COLORS.map((color) => `rgb(${color.join(",")})`).join(",")})`,
        }}
      />
      <div className="flex justify-between">
        <span>Low</span>
        <span>Relative intensity</span>
        <span>High</span>
      </div>
    </div>
  );
}
