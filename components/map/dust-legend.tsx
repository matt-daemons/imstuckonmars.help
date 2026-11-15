import { DUST_COLORS } from "@/lib/mars/dust-field";
import { DUST_FIELDS, type DustField } from "@/lib/mars/dust-simulation";

export function DustLegend({ field = "tau_current" }: { field?: DustField }) {
  const definition = DUST_FIELDS[field];
  return (
    <div
      aria-label={`${definition.title}, 0 to ${definition.maximum} ${definition.unit}; blue low, plum high`}
      className="space-y-1 text-sm"
    >
      <div
        aria-hidden
        className="h-2"
        style={{
          background: `linear-gradient(to right, ${DUST_COLORS.map((color) => `rgb(${color.join(",")})`).join(",")})`,
        }}
      />
      <div className="flex justify-between">
        <span className="font-mono">0</span>
        <span>{definition.title}</span>
        <span className="font-mono">{definition.maximum}</span>
      </div>
      <p>
        {definition.unit}
        {field === "tau_current" ? " · normalized to 610 Pa" : ""}
      </p>
    </div>
  );
}
