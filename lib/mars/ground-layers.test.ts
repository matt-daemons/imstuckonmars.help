import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  GEOLOGY_LEGEND,
  REGIONAL_SLOPE_BOUNDS,
  REGIONAL_SLOPE_LEGEND,
  regionalSlopeTiles,
  type GeologySummary,
  ROUGHNESS_LEGEND,
  THERMAL_INERTIA_LEGEND,
  type RoughnessSummary,
  type ThermalInertiaSummary,
  geologyFor,
  hiriseIdOfDtm,
  roughnessTiles,
  thermalInertiaFor,
  thermalInertiaTiles,
} from "./ground-layers";

const DTM = "DTEEC_033225_2250_033146_2250_A01";
const read = async <T>(name: string) =>
  JSON.parse(await readFile(`public/data/processed/${name}`, "utf8")) as T;

describe("ground overlays", () => {
  it("builds absolute local tile URLs, or uses a published root", () => {
    expect(thermalInertiaTiles("http://x", null)).toEqual([
      "http://x/data/thermal-inertia/{z}/{x}/{y}.webp",
    ]);
    expect(thermalInertiaTiles("http://x", "https://r2/ti")).toEqual([
      "https://r2/ti/{z}/{x}/{y}.webp",
    ]);
    expect(roughnessTiles("http://x", DTM, null)).toEqual([
      `http://x/data/sites/${DTM}/roughness/{z}/{x}/{y}.webp`,
    ]);
    expect(roughnessTiles("http://x", DTM, "https://r2/sites-v2")).toEqual([
      `https://r2/sites-v2/sites/${DTM}/roughness/{z}/{x}/{y}.webp`,
    ]);
  });

  it("legends match the class labels the pipelines publish", async () => {
    const ti = await read<{ class_breaks: { label: string }[] }>("thermal-inertia-sites.json");
    expect(THERMAL_INERTIA_LEGEND.map((c) => c.label)).toEqual(ti.class_breaks.map((c) => c.label));
    const rough = await read<{ sites: Record<string, { classes: { label: string }[] }> }>(
      "roughness-sites.json",
    );
    expect(ROUGHNESS_LEGEND.map((c) => c.label)).toEqual(
      rough.sites[DTM].classes.map((c) => c.label),
    );
  });

  it("finds each site's thermal inertia and roughness summary", async () => {
    const ti = await read<ThermalInertiaSummary>("thermal-inertia-sites.json");
    const rough = await read<RoughnessSummary>("roughness-sites.json");
    expect(hiriseIdOfDtm(DTM)).toBe("ESP_033225_2250");
    expect(thermalInertiaFor(ti, DTM)?.class_robust).toBe(true);
    expect(thermalInertiaFor(ti, "habitat")?.class_robust).toBe(false);
    for (const id of Object.keys(rough.sites)) expect(thermalInertiaFor(ti, id)).toBeDefined();
  });

  it("colours every geologic unit in the corridor and finds each site's unit", async () => {
    const fc = await read<{ features: { properties: { unit: string } }[] }>("geology.geojson");
    const legend = new Set(GEOLOGY_LEGEND.map((c) => c.unit));
    for (const f of fc.features)
      expect(legend.has(f.properties.unit), f.properties.unit).toBe(true);
    const geo = await read<GeologySummary>("geology-sites.json");
    expect(geologyFor(geo, DTM)?.unit).toBe("Av");
    expect(geologyFor(geo, "habitat")?.unit).toBe("Av");
  });

  it("covers the regional-slope corridor and keeps its legend on the pipeline classes", async () => {
    const rs = await read<{ class_breaks_deg: number[]; grid: { bbox_0_360: number[] } }>(
      "regional-slope.json",
    );
    expect(REGIONAL_SLOPE_LEGEND).toHaveLength(rs.class_breaks_deg.length + 1);
    const [w, s, e, n] = rs.grid.bbox_0_360;
    const [east, west] = REGIONAL_SLOPE_BOUNDS;
    expect([east[0], east[1], east[3]]).toEqual([
      Math.floor(w * 100) / 100,
      Math.floor(s * 100) / 100,
      Math.ceil(n * 100) / 100,
    ]);
    expect(west[2]).toBeCloseTo(e - 360, 1);
    expect(regionalSlopeTiles("https://x")[0]).toBe(
      "https://tiles.imstuckonmars.help/sites-v2/regional-slope/{z}/{x}/{y}.webp",
    );
  });
});
