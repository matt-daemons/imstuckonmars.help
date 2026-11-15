import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomebaseMapLabel } from "./map-label";

describe("homebase map label", () => {
  it("identifies the model without exposing a dashboard action", () => {
    const html = renderToStaticMarkup(<HomebaseMapLabel enlarged />);
    expect(html).toContain("Homebase");
    expect(html).toContain("Not to scale");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain("Open homebase");
  });
});
