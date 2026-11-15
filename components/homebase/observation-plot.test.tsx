import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObservationPlot } from "./observation-plot";
import type { HomebaseMetric } from "@/lib/homebase/types";

describe("observation plot presentation", () => {
  it("draws lines without stretched point markers and preserves an isolated sample", () => {
    const metric: HomebaseMetric = {
      id: "temperature",
      title: "Air temperature",
      value: 202,
      observed_utc_ms: 300000,
      status: "available",
      minimum: 200,
      maximum: 202,
      unit: "K",
      decimals: 1,
      cadence_s: 60,
      source: { instrument: "MEDA", site: "Jezero crater", url: null, product_id: null },
      note: "Archived samples",
      points: [
        { utc_ms: 0, value: 200, count: 1 },
        { utc_ms: 60000, value: 201, count: 1 },
        { utc_ms: 300000, value: 202, count: 1 },
      ],
    };
    const html = renderToStaticMarkup(
      <ObservationPlot metric={metric} from={0} to={300000} revealKey={0} />,
    );
    expect(html).not.toContain("<circle");
    expect(html.match(/class="hb-signal"/g)).toHaveLength(2);
    expect(html.match(/class="hb-signal-point"/g)).toHaveLength(1);
    expect(html).toContain("Gaps are not interpolated");
    expect(html).toContain("Arrow keys inspect samples");
    expect(html).toContain('tabindex="0"');
  });
});
