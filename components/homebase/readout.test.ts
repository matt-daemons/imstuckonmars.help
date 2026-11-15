import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Readout } from "./readout";

const render = (value: number | null, decimals = 1) =>
  renderToStaticMarkup(createElement(Readout, { value, decimals, unit: "K", revealKey: 1 }));

describe("terminal readout rendering", () => {
  it("renders the real number as one text node, with no reel or filler glyphs", () => {
    const markup = render(201.3);
    expect(markup).toContain(">201.3</span>");
    expect(markup).toContain('aria-label="201.3 K"');
    expect(markup).not.toMatch(/hb-digit-(reel|window)|[░▒▓]/);
  });
  it("does not turn missing data into zero", () => {
    expect(render(null)).toContain("No data");
    expect(render(0)).toContain(">0.0</span>");
  });
  it("marks overflow without truncating the sign or decimal point", () => {
    const markup = render(-12000.123, 2);
    expect(markup).toContain('data-overflow="true"');
    expect(markup).toContain(">−**.**</span>");
    expect(markup).toContain("display overflow");
  });
});
