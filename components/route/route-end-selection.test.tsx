import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SitePoi } from "@/components/map/scene-panel";
import type { LngLat } from "@/lib/mars/types";
import { initialRoutePlan, routePlanReducer, type RoutePlanInputs } from "./route-plan";
import { useRoutePlanResult, type RoutePlanResult } from "./use-route-plan-result";

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

describe("destination selection during exclusion replanning", () => {
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
});
