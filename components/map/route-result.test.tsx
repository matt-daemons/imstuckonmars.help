import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PlannedPath } from "@/lib/mars/routing";
import { WalkStatus } from "./route-result";

const blocked: PlannedPath = {
  status: "start_blocked",
  path: [],
  distance_m: 0,
  cost: 0,
  max_slope_deg: 0,
  time_min: 0,
  expanded: 0,
};

function message(path: PlannedPath) {
  return renderToStaticMarkup(
    <WalkStatus
      plan={{ outbound: path, back: blocked, summary: null }}
      check={null}
      notChecked=""
      loadFailed={false}
    />,
  );
}

describe("blocked route feedback", () => {
  it("does not blame steep ground when a zone or obstacle blocks the start", () => {
    const html = message({ ...blocked, blocked_by: "zone_or_obstacle" });
    expect(html).toContain("Start is blocked by a no-go zone or mapped obstacle");
    expect(html).toContain("clear overlapping zones");
    expect(html).not.toContain("steeper");
  });

  it("distinguishes steep ground and missing terrain", () => {
    expect(message({ ...blocked, blocked_by: "slope" })).toContain("steeper than 20°");
    const html = message({ ...blocked, status: "goal_blocked", blocked_by: "no_data" });
    expect(html).toContain("End has no usable terrain data");
    expect(html).not.toContain("steeper");
  });
});
