import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ROUGHNESS_LEGEND,
  THERMAL_INERTIA_LEGEND,
  type RoughnessSummary,
  type ThermalInertiaSummary,
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
});
