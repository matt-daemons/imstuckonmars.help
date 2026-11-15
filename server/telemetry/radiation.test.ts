import { describe, expect, it } from "vitest";
import type { Database } from "../db";
import {
  MAX_OBSERVATION_AGE_MS,
  observationAt,
  radiationContext,
  type RadiationObservation,
} from "./radiation";

const observation = (utc_ms: number, flag: string | null = null): RadiationObservation => ({
  product_id: "rad-product",
  source_row: utc_ms,
  utc_ms,
  alive_time_s: 926,
  flag,
  dose_rate_b_ugy_day: flag ? null : 195,
  dose_rate_b_rtg_corrected_ugy_day: flag ? null : 136,
  dose_rate_e_ugy_day: flag ? null : 193,
});
const series = [observation(1000), observation(2000, "Cmds"), observation(3000)];
const unusedDatabase = {} as Database;

describe("radiation alignment by UTC observation start", () => {
  it("selects the latest observation that started at or before the instant", () => {
    expect(observationAt(series, 1000)?.utc_ms).toBe(1000);
    expect(observationAt(series, 1999)?.utc_ms).toBe(1000);
    expect(observationAt(series, 2500)?.flag).toBe("Cmds");
    expect(observationAt(series, 3000)?.utc_ms).toBe(3000);
  });

  it("reports a gap before coverage or after an observation is too old", () => {
    expect(observationAt(series, 999)).toBeNull();
    expect(observationAt(series, 3000 + MAX_OBSERVATION_AGE_MS)?.utc_ms).toBe(3000);
    expect(observationAt(series, 3001 + MAX_OBSERVATION_AGE_MS)).toBeNull();
    expect(observationAt([], 1000)).toBeNull();
  });

  it("never aligns without a configured release or a resolved replay UTC", async () => {
    await expect(radiationContext(unusedDatabase, undefined, 1000)).resolves.toMatchObject({
      status: "not_configured",
      observation: null,
    });
    const unresolved = await radiationContext(unusedDatabase, "release", null);
    expect(unresolved).toMatchObject({ status: "time_unresolved", observation: null });
    expect(unresolved.proxy).toContain("Gale crater");
  });
});
