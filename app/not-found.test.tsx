import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("not-found recovery", () => {
  it("offers an ordinary home link, including without client JavaScript", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).toContain("Return to mission map");
  });
});
