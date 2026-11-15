import { describe, expect, it } from "vitest";

import { ROUTE_PLAN_TIMEOUT_MS, routePlanErrorMessage } from "./use-route-plan-result";

describe("routePlanErrorMessage", () => {
  it("says a timed-out plan was stopped and can be retried", () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");

    expect(routePlanErrorMessage(timeout)).toBe(
      "Route calculation took longer than 35 s and was stopped. Retry the route.",
    );
    expect(ROUTE_PLAN_TIMEOUT_MS).toBe(35_000);
  });

  it("passes on the server's message", () => {
    expect(routePlanErrorMessage(new Error("Choose a published destination site."))).toBe(
      "Choose a published destination site.",
    );
  });

  it("falls back to a generic message", () => {
    expect(routePlanErrorMessage("nope")).toBe("Route calculation failed.");
  });

  it("stops a request after the timeout", async () => {
    // The same signal the hook builds, on a short timeout.
    const signal = AbortSignal.any([new AbortController().signal, AbortSignal.timeout(1)]);
    await new Promise((resolve) => signal.addEventListener("abort", resolve));

    expect(routePlanErrorMessage(signal.reason)).toMatch(/^Route calculation took longer/);
  });
});
