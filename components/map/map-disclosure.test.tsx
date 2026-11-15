import { renderToStaticMarkup } from "react-dom/server";
import { Layers } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MapDisclosure } from "./map-disclosure";

describe("map disclosure", () => {
  it("uses a native collapsed disclosure with a shared chevron and retained content", () => {
    const html = renderToStaticMarkup(
      <MapDisclosure title="Layers" icon={Layers}>
        <p>Layer settings</p>
      </MapDisclosure>,
    );
    expect(html).toContain('<details class="map-disclosure">');
    expect(html).toContain("<summary>");
    expect(html).toContain("map-disclosure-chevron");
    expect(html).toContain("Layer settings");
    expect(html).not.toContain(" open=");
  });
});
