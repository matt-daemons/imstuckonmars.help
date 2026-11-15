import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObservationPlot } from "./observation-plot";
import { ObservationRecords } from "./observation-inspector";
import type { HomebaseMetric } from "@/lib/homebase/types";

const from = Date.parse("2023-06-06T15:49:00Z");
const to = Date.parse("2023-06-06T18:08:00Z");
const radiation: HomebaseMetric = {
  id: "radiation",
  title: "Radiation proxy",
  value: 8,
  observed_utc_ms: to,
  status: "available",
  minimum: 8,
  maximum: 8,
  unit: "µGy/h",
  decimals: 2,
  cadence_s: 1800,
  source: { instrument: "RAD", site: "Gale crater", url: null, product_id: null },
  note: "Historical proxy, not crew exposure.",
  points: Array.from({ length: 10 }, (_, index) => ({
    utc_ms: Date.parse("2023-06-06T15:20:00Z") + index * 17 * 60000,
    value: 8,
    count: 1,
  })),
};

describe("observation plot presentation", () => {
  it("keeps the chart and records inside the same archive window", () => {
    const plot = renderToStaticMarkup(
      <ObservationPlot metric={radiation} from={from} to={to} revealKey={0} />,
    );
    const records = renderToStaticMarkup(
      <ObservationRecords metric={radiation} from={from} to={to} />,
    );
    expect(plot).toContain("8 observations");
    expect(records).toContain("of 8");
    expect(records).not.toContain("<td>15:20</td>");
    expect(records).not.toContain("<td>15:37</td>");
    expect(records).toContain("<td>15:54</td>");
    expect(plot).toContain("Show last 30 min");
    expect(plot).toContain("Full window · Approx. UTC");
  });

  it("shows only the last 30 minutes when the inspector selects that range", () => {
    const plot = renderToStaticMarkup(
      <ObservationPlot metric={radiation} from={from} to={to} revealKey={0} zoomed />,
    );
    const records = renderToStaticMarkup(
      <ObservationRecords metric={radiation} from={to - 30 * 60000} to={to} />,
    );
    expect(plot).toContain("17:38");
    expect(plot).not.toContain("15:49");
    expect(plot).toContain("1 observation");
    expect(plot).not.toContain("1 observations");
    expect(plot).toContain("Show full window");
    expect(plot).toContain("Last 30 min · Approx. UTC");
    expect(records).toContain("of 1");
    expect(records).toContain("<td>17:53</td>");
  });

  it("includes window boundaries and keeps withheld records distinct from observations", () => {
    const metric: HomebaseMetric = {
      ...radiation,
      points: [
        { utc_ms: from - 1, value: 9, count: 1 },
        { utc_ms: from, value: 8, count: 1 },
        { utc_ms: from + 60000, value: null, count: 0 },
        { utc_ms: to, value: 8, count: 1 },
        { utc_ms: to + 1, value: 9, count: 1 },
      ],
    };
    const plot = renderToStaticMarkup(
      <ObservationPlot metric={metric} from={from} to={to} revealKey={0} />,
    );
    const records = renderToStaticMarkup(
      <ObservationRecords metric={metric} from={from} to={to} />,
    );
    expect(plot).toContain("2 observations");
    expect(records).toContain("Rows 1–3 of 3");
    expect(records).toContain("Withheld / missing");
    expect(records).toContain("<td>15:49</td>");
    expect(records).toContain("<td>18:08</td>");
    expect(records).not.toContain("<td>9.00</td>");
  });

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
