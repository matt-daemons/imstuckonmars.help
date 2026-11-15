import type { PlannerRequest, PlannerResponse } from "../../lib/mars/planner-contract";
import version from "./version.json";

export const PLANNER_VERSION = version.sha256;
export const ROUTE_CACHE_SECONDS = 7 * 24 * 60 * 60;

/** Parsed schema fixes key order. Coordinates are exact; no rounding or direction reversal. */
export async function routeCacheKey(input: PlannerRequest, revision = PLANNER_VERSION) {
  const data = new TextEncoder().encode(JSON.stringify({ revision, input }));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cachedRoute(
  input: PlannerRequest,
  cache: Pick<Cache, "match" | "put">,
  calculate: () => Promise<PlannerResponse["result"]>,
): Promise<{ response: PlannerResponse; hit: boolean }> {
  const key = await routeCacheKey(input);
  const request = new Request(`https://imstuckonmars.help/__route-cache/${PLANNER_VERSION}/${key}`);
  const cached = await cache.match(request).catch(() => undefined);
  if (cached) return { response: (await cached.json()) as PlannerResponse, hit: true };
  const result = await calculate();
  const response: PlannerResponse = { key, version: PLANNER_VERSION, result };
  const body = JSON.stringify(response);
  if (new TextEncoder().encode(body).byteLength > 4_000_000)
    throw new Error("Route result exceeds the response limit");
  // Await the bounded write so the immediately repeated request can reuse this result.
  await cache
    .put(
      request,
      new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ROUTE_CACHE_SECONDS}`,
        },
      }),
    )
    .catch((error: unknown) => {
      console.warn(
        JSON.stringify({
          event: "route_cache_write_failed",
          key,
          message: error instanceof Error ? error.message : "Unknown cache error",
        }),
      );
    });
  return { response, hit: false };
}
