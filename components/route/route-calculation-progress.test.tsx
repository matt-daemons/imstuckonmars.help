import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteCalculationProgress } from "./route-calculation-progress";

describe("route calculation feedback", () => {
  it("keeps a text label and a reduced-motion fallback without claiming a percentage", () => {
    const html = renderToStaticMarkup(<RouteCalculationProgress />);
    expect(html).toContain("Calculating route…");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain('role="progressbar"');
  });
});
