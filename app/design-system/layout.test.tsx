import { afterEach, describe, expect, it, vi } from "vitest";
import DesignSystemLayout from "./layout";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe("design-system visibility", () => {
  it("is not publicly served in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DesignSystemLayout({ children: "Catalog" })).toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });

  it("keeps the catalog available in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => DesignSystemLayout({ children: "Catalog" })).not.toThrow();
  });
});
