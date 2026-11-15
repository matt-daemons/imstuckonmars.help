import type { Map as MapLibreMap } from "maplibre-gl";
import type { EffectCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collection } from "@/components/map/route-layers";
import type { PlannedPath } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";
import { initialRoutePlan, type MissionType } from "./route-plan";
import type { RoutePlan } from "./route-plan-provider";
import { RouteMapLayers } from "./route-map-layers";

const state = vi.hoisted(() => ({
  effects: [] as EffectCallback[],
  plan: null as unknown as RoutePlan,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: EffectCallback) => state.effects.push(effect),
}));
vi.mock("./route-plan-provider", () => ({ useRoutePlan: () => state.plan }));

const start: LngLat = [-176.05, 45.97];
const end: LngLat = [-176.33383, 44.41589];
const blocked: PlannedPath = {
  status: "start_blocked",
  blocked_by: "zone_or_obstacle",
  path: [],
  distance_m: 0,
  cost: 0,
  max_slope_deg: 0,
  time_min: 0,
  expanded: 0,
};

function fixture(mission: MissionType, pending: boolean): RoutePlan {
  const failedLeg = { outbound: blocked, back: blocked, summary: null };
  return {
    inputs: {
      ...initialRoutePlan(start),
      mission,
      end,
      zones: [{ id: "zone-1", name: "Blocked start", ring: [start, end, [-176, 46]] }],
    },
    base: start,
    dispatch: vi.fn(),
    destinations: [],
    destination: null,
    planning: pending,
    walk: {
      plan: mission === "walking" && !pending ? failedLeg : null,
      shortest: null,
      terrain: null,
      loadFailed: false,
    },
    journey: {
      plan:
        mission === "drive-walk" && !pending
          ? {
              status: "drive_failed",
              collection: null,
              drive: failedLeg,
              walk: null,
              staging: null,
              verdict: null,
            }
          : null,
      shortest: null,
      driveGrid: null,
      driveSlope: null,
      siteGrid: null,
      driveFailed: false,
      siteFailed: false,
    },
  };
}

describe("selected endpoint map layers", () => {
  beforeEach(() => {
    state.effects = [];
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#ffffff" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["walking", true],
    ["walking", false],
    ["drive-walk", true],
    ["drive-walk", false],
  ] as const)("keeps the destination rendered for %s with pending=%s", (mission, pending) => {
    state.plan = fixture(mission, pending);
    const data = new Map<string, ReturnType<typeof collection>>();
    const layers = new Map<string, { source: string }>();
    const map = {
      addSource: (id: string) => data.set(id, collection([])),
      addLayer: (layer: { id: string; source: string }) => layers.set(layer.id, layer),
      getLayer: (id: string) => layers.get(id),
      getSource: (id: string) => ({
        setData: (features: ReturnType<typeof collection>) => data.set(id, features),
      }),
    } as unknown as MapLibreMap;
    renderToStaticMarkup(<RouteMapLayers map={map} />);
    for (const effect of state.effects) effect();

    expect(data.get("route-ends")?.features).toEqual([
      expect.objectContaining({
        properties: { end: "start" },
        geometry: { type: "Point", coordinates: start },
      }),
      expect.objectContaining({
        properties: { end: "end" },
        geometry: { type: "Point", coordinates: end },
      }),
    ]);
    expect(layers.get("route-ends")?.source).toBe("route-ends");
    expect(layers.get("selected-destination-ring")?.source).toBe("route-ends");
    expect(data.get("planned-route")?.features).toEqual([]);
    expect(data.get("journey")?.features).toEqual([]);
    expect(data.get("no-go-zones")?.features).toHaveLength(1);
  });
});
