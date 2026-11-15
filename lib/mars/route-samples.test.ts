import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FLIGHT_RULES } from "@/lib/flight-rules/rules";

import { MARS_RADIUS_M } from "./terrain";
import type { LngLat, RouteLegProperties, RouteSummary, Verdict } from "./types";

// Hand-made sample routes for UI work. These checks keep their made-up numbers
// consistent with their own geometry, so the UI is tested against believable data.
const DIR = join(process.cwd(), "public/data/samples/routes");
const files = readdirSync(DIR).filter((name) => name.endsWith(".geojson"));

type Feature = {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};
type Collection = { route: RouteSummary; features: Feature[] };

const RANK: Record<Verdict, number> = { GO: 0, CAUTION: 1, NO_GO: 2 };

function greatCircleKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return (2 * MARS_RADIUS_M * Math.asin(Math.sqrt(h))) / 1000;
}

function lineKm(line: LngLat[]): number {
  return line.slice(1).reduce((sum, point, i) => sum + greatCircleKm(line[i]!, point), 0);
}

describe.each(files)("sample route %s", (file) => {
  const data = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Collection;
  const legs = data.features
    .filter((f) => f.properties.kind === "route-leg")
    .map((f) => ({
      line: f.geometry.coordinates as LngLat[],
      props: f.properties as unknown as RouteLegProperties,
    }))
    .sort((a, b) => a.props.leg - b.props.leg);
  const summary = data.route;

  it("is labelled simulated", () => {
    expect(summary.simulated).toBe(true);
    expect(summary.source).toMatch(/SAMPLE/);
    for (const { props } of legs) expect(props.simulated).toBe(true);
  });

  it("has connected legs in order, starting at the base", () => {
    expect(legs.map((l) => l.props.leg)).toEqual(legs.map((_, i) => i + 1));
    expect(legs[0]!.props.from).toBe("base");
    expect(legs.at(-1)!.props.to).toBe(summary.destination_id);
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i]!.line[0]).toEqual(legs[i - 1]!.line.at(-1));
      expect(legs[i]!.props.start_offset_min).toBe(
        legs[i - 1]!.props.start_offset_min +
          legs[i - 1]!.props.est_time_min +
          legs[i - 1]!.props.stop_min,
      );
    }
  });

  it("states leg distances that match the drawn lines (Mars radius)", () => {
    for (const { line, props } of legs) {
      expect(props.distance_km).toBeCloseTo(lineKm(line), 1);
    }
  });

  it("keeps every walk inside the walk-back rule", () => {
    for (const { line, props } of legs.filter((l) => l.props.mode === "walk")) {
      const farthest = Math.max(...line.map((p) => greatCircleKm(line[0]!, p)));
      expect(farthest).toBeLessThanOrEqual(FLIGHT_RULES.walk_back.max_distance_km);
      expect(props.est_time_min).toBe(
        Math.round((props.distance_km / FLIGHT_RULES.walk_back.walking_km_per_hour) * 60),
      );
    }
  });

  it("summarises the legs: totals, steepest slope, worst verdict", () => {
    const sum = (pick: (p: RouteLegProperties) => number) =>
      legs.reduce((total, { props }) => total + pick(props), 0);
    const worst = legs.reduce((a, b) => (RANK[b.props.verdict] > RANK[a.props.verdict] ? b : a));

    expect(summary.distance_km).toBeCloseTo(
      sum((p) => p.distance_km),
      2,
    );
    expect(summary.est_time_min).toBe(sum((p) => p.est_time_min + p.stop_min));
    expect(summary.max_slope).toBe(Math.max(...legs.map((l) => l.props.max_slope)));
    expect(summary.verdict).toBe(worst.props.verdict);
    expect(summary.limiting_factor).toBe(worst.props.limiting_factor);
    expect(summary.time_to_shelter_min).toBe(
      Math.max(...legs.map((l) => l.props.time_to_shelter_min)),
    );
  });
});
