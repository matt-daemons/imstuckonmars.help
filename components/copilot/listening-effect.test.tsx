import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListeningEffect } from "./listening-effect";

describe("button-bounded listening indicator", () => {
  it("keeps the control mounted and adds only a decorative light while active", () => {
    const render = (active: boolean) =>
      renderToStaticMarkup(
        <ListeningEffect active={active}>
          <button type="button">Ask LARA</button>
        </ListeningEffect>,
      );
    expect(render(false)).toContain("Ask LARA</button>");
    expect(render(false)).not.toContain("lara-listening-light");
    expect(render(true)).toContain('data-listening="true"');
    expect(render(true)).toContain('class="lara-listening-light" aria-hidden="true"');
    expect(render(true)).not.toContain("canvas");
    expect(render(true)).not.toContain("lara-listening-edge");
  });
});
