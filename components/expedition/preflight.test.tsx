import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Preflight } from "./preflight";

vi.mock("@/components/expedition/expedition-provider", () => ({
  SPEEDS: [1, 10, 60],
  useExpedition: () => ({ access: null, snapshot: null }),
}));
vi.mock("@/components/map/mission-view", () => ({
  useMissionView: () => ({ inspectedLeg: null, inspectLeg: () => {} }),
}));
vi.mock("@/components/route/route-plan-provider", () => ({
  useRoutePlan: () => ({
    inputs: { mission: "walking", route: "safest", samplingMin: 60 },
    walk: { plan: null },
    journey: { plan: null },
    base: [-176.05, 45.97],
    dispatch: () => {},
    destination: null,
  }),
}));

describe("preflight launch eligibility", () => {
  it("disables launch with an accessible reason when no complete route exists", () => {
    const html = renderToStaticMarkup(<Preflight verdict={null} />);
    const launch = html.match(/<button[^>]*>[^]*?Launch expedition<\/button>/)?.[0];
    expect(launch).toContain('aria-disabled="true"');
    expect(launch).toContain('aria-describedby="preflight-status"');
    expect(launch).toContain("disabled");
    expect(html).toContain("Plan a walk with an end point first.");
  });
});
