import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { FLIGHT_RULES } from "./rules";

const configPath = fileURLToPath(new URL("../../config.yaml", import.meta.url));
const config = parse(readFileSync(configPath, "utf8")) as { thresholds: Record<string, number> };

describe("config.yaml thresholds", () => {
  it("match the flight rules, so the pipelines and the app use the same limits", () => {
    expect(config.thresholds).toEqual({
      slope_max_deg: FLIGHT_RULES.slope.no_go_above_degrees,
      suit_budget_h: FLIGHT_RULES.suit_supply.primary_minutes / 60,
      suit_reserve_min: FLIGHT_RULES.suit_supply.reserve_minutes,
      radiation_caution_ugy_per_h: FLIGHT_RULES.dose_rate.caution_at_micrograys_per_hour,
      radiation_no_go_ugy_per_h: FLIGHT_RULES.dose_rate.no_go_at_micrograys_per_hour,
      walk_back_max_km: FLIGHT_RULES.walk_back.max_distance_km,
    });
  });
});
