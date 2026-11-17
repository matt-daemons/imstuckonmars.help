import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endFeatures } from "@/components/map/route-layers";
import type { SitePoi } from "@/components/map/scene-panel";
import type { PlannerRequest, PlannerResponse } from "@/lib/mars/planner-contract";
import type { LngLat } from "@/lib/mars/types";
import { initialRoutePlan, routePlanReducer, type RoutePlanInputs } from "./route-plan";
import type { LoadedRouteRequest } from "./route-request-state";
import { useRoutePlanResult, type RoutePlanResult } from "./use-route-plan-result";

// Seed a completed request in the real hook's state without needing a browser. These probes
// check the render-time projection of old/current outcomes, not React's effect scheduling.
const state = vi.hoisted(() => ({ loaded: null as LoadedRouteRequest | null }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => react.useState(initial === null ? state.loaded : initial),
  };
});

const base: LngLat = [-176.05, 45.97];
const sites: SitePoi[] = [
  {
    id: "site-a",
    hiriseId: "ESP_033225_2250",
    title: "Site A",
    confirmed: true,
    center: [-176.33383, 44.41589],
  },
  {
    id: "site-b",
    hiriseId: "ESP_034082_2260",
    title: "Site B",
    confirmed: true,
    center: [-171.38243, 45.64829],
  },
];

function resultFor(inputs: RoutePlanInputs): RoutePlanResult {
  let result: RoutePlanResult | undefined;
  function Reader() {
    result = useRoutePlanResult(inputs, base, sites);
    return null;
  }
  renderToStaticMarkup(<Reader />);
  return result!;
}

function requestKey(inputs: RoutePlanInputs): string {
  const request: PlannerRequest = {
    mission: "drive-walk",
    start: inputs.start,
    siteId: sites.find((site) => site.center === inputs.end)!.id,
    power: inputs.power,
    samplingMin: inputs.samplingMin,
    zones: inputs.zones,
    compare: true,
  };
  return JSON.stringify(request);
}

function readyWithoutRoute(
  inputs: RoutePlanInputs,
  status: "drive_failed" | "walk_failed" | "no_staging",
): LoadedRouteRequest {
  const key = requestKey(inputs);
  const response: PlannerResponse = {
    key,
    version: "test",
    result: {
      mission: "drive-walk",
      plan: {
        status,
        collection: null,
        drive: null,
        walk: null,
        staging: null,
        verdict: null,
      },
      shortest: null,
      boulders: [],
      driveCellM: 100,
      comparison: null,
    },
  };
  return { key, attempt: 0, state: { kind: "ready", response, cache: "MISS" } };
}

describe("destination selection during exclusion replanning", () => {
  beforeEach(() => {
    state.loaded = null;
  });

  it("retains and can change the selected site without a successful plan or clearing zones", () => {
    const selected = {
      ...initialRoutePlan(base),
      mission: "drive-walk" as const,
      end: sites[0].center,
    };
    const blocked = routePlanReducer(selected, {
      type: "addZone",
      ring: [
        [-176.06, 45.96],
        [-176.04, 45.96],
        [-176.04, 45.98],
        [-176.06, 45.98],
      ],
    });
    const pending = resultFor(blocked);
    expect(pending.journey.plan).toBeNull();
    expect(pending.destination?.id).toBe("site-a");
    const changed = routePlanReducer(blocked, { type: "setEnd", point: sites[1].center });
    expect(resultFor(changed).destination?.id).toBe("site-b");
    expect(changed.zones).toHaveLength(1);
    expect(resultFor(routePlanReducer(changed, { type: "clearZones" })).destination?.id).toBe(
      "site-b",
    );
  });

  it.each(["drive_failed", "walk_failed", "no_staging"] as const)(
    "retains the selected site when the server returns %s",
    (status) => {
      const selected = {
        ...initialRoutePlan(base),
        mission: "drive-walk" as const,
        end: sites[0].center,
      };
      state.loaded = readyWithoutRoute(selected, status);

      const result = resultFor(selected);
      expect(result.planning).toBe(false);
      expect(result.journey.plan?.status).toBe(status);
      expect(result.destination).toBe(sites[0]);
      expect(endFeatures(selected.start, selected.end).at(-1)?.geometry).toEqual({
        type: "Point",
        coordinates: sites[0].center,
      });
    },
  );

  it("keeps the destination through a current request error and hides that error after a zone edit", () => {
    const selected = {
      ...initialRoutePlan(base),
      mission: "drive-walk" as const,
      end: sites[0].center,
    };
    state.loaded = {
      key: requestKey(selected),
      attempt: 0,
      state: { kind: "failed", message: "Route calculation timed out. Retry the route." },
    };
    const failed = resultFor(selected);
    expect(failed.planningError).toMatch(/timed out/);
    expect(failed.destination).toBe(sites[0]);
    expect(failed.journey.plan).toBeNull();

    const edited = routePlanReducer(selected, {
      type: "addZone",
      ring: [base, sites[0].center, sites[1].center],
    });
    const pending = resultFor(edited);
    expect(pending.planning).toBe(true);
    expect(pending.planningError).toBeUndefined();
    expect(pending.destination).toBe(sites[0]);
    expect(edited.end).toBe(selected.end);
  });

  it("does not let an older site's response select it again after the destination changes", () => {
    const selected = {
      ...initialRoutePlan(base),
      mission: "drive-walk" as const,
      end: sites[0].center,
    };
    state.loaded = readyWithoutRoute(selected, "no_staging");
    const changed = routePlanReducer(selected, { type: "setEnd", point: sites[1].center });

    const pending = resultFor(changed);
    expect(pending.destination).toBe(sites[1]);
    expect(pending.planning).toBe(true);
    expect(pending.journey.plan).toBeNull();
    expect(endFeatures(changed.start, changed.end).at(-1)?.geometry).toEqual({
      type: "Point",
      coordinates: sites[1].center,
    });
  });

  it("distinguishes an explicit map end from a named site without removing the map endpoint", () => {
    const selected = {
      ...initialRoutePlan(base),
      mission: "drive-walk" as const,
      end: sites[0].center,
    };
    state.loaded = readyWithoutRoute(selected, "no_staging");
    const point: LngLat = [-175.95, 46.03];
    const changed = routePlanReducer(selected, { type: "setEnd", point });

    const result = resultFor(changed);
    expect(result.destination).toBeNull();
    expect(result.journey.plan).toBeNull();
    // Drive/walk requires a published site; an arbitrary point is still the selected map end.
    expect(result.planning).toBe(false);
    expect(changed.end).toBe(point);
    expect(endFeatures(changed.start, changed.end).at(-1)?.geometry).toEqual({
      type: "Point",
      coordinates: point,
    });

    const walking = { ...changed, mission: "walking" as const };
    expect(resultFor(walking).planning).toBe(true);
    expect(walking.end).toBe(point);
  });
});
