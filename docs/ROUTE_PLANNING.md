# Backend route planning

`POST /api/routes/plan` runs the existing walking and rover algorithms in the
Hono Worker. The browser sends coordinates, destination ID, power, sampling
time, no-go zones and whether to compare routes. It no longer downloads route
grids or runs A*. Map tiles still load normally for display.

The response includes directed outbound/return paths, modeled timing and
resource checks, staging information, boulders and comparison profiles. The
server resolves site IDs against its packaged catalog; clients cannot select
asset URLs. An unavailable dataset fails the request rather than substituting
terrain. The browser hides results for older inputs, aborts superseded requests
and offers Retry route calculation after errors. Aborting a request does not
guarantee that a synchronous server calculation has stopped.

## Cache

Completed deterministic results, including no-path/no-staging results, are
cached for seven days in the Workers Cache API. HTTP responses remain
`Cache-Control: no-store`; `X-Route-Cache` reports HIT or MISS. The internal
cache is local to a Cloudflare data center, is evictable, and is not a permanent
or globally replicated store. Simultaneous misses can compute independently.
Cache failures do not discard a successfully computed route.

Keys hash the schema-normalized full request and a build-generated revision of
planner code, flight rules, packaged terrain/ground/boulder/site inputs and
immutable remote release roots. Coordinates are not rounded and directed paths
are not reversed to share keys. Changing power, sampling time, zones, comparison
mode, terrain or algorithm creates a different entry. `pnpm build` regenerates
`server/routes/version.json`; do not publish changed bytes under an existing
remote release root.

No mission tokens, resource-session state, changing weather or live drill state
are cached here. Existing condition overlays and the D1-owned expedition remain
separate. Selecting a route does not launch a simulation or change its reserves.

## Limits and deployment

Requests are limited to 64 KiB, 20 zones and 200 total polygon vertices, and
12 requests per minute per client address. Responses are capped at 4 MB.
Site raster windows are bounded; local assets have explicit byte limits.
Remote rasters require matching HTTP range responses, with at most 128 reads
and 32 MB requested per raster. Each individual read is limited to 8 MB.
All terrain resolution, masks, units and path costs are unchanged.

Uncached route planning requires **Workers Paid**. The configured CPU budget is
30 seconds and the platform memory limit is 128 MB per isolate. Local workerd
tests establish compatibility, not production account entitlement or concurrency
capacity. Verify the account plan and production CPU/memory metrics before
rollout; the available credentials could not read account subscriptions.
No paid subscription change is performed by this implementation.

The planner uses the existing `ASSETS` binding for packaged data, public immutable
R2 COGs for site windows and a bounded native-stream PNG decoder for base
Terrarium tiles. Vite development alone uses its localhost static-file server
because its ASSETS binding does not expose public files. No database migration,
R2 write access or second mission-state service is needed.

## Verification

The previous browser planner and the backend produced identical drive/walk
plans for all four sites on `sites-v1`, including the site's no-staging result.
Walking geometry differed only at about 1e-14 degrees and 1e-12 minutes between
V8 environments. Both methods preserve directional return costs, missing-data
masks, slope walls and no-corner-cutting behavior.

Local packaged tests measured the nearest site's cold request at about 1.4 s
and a cached request at 10 ms; farther sites took about 3.5 s cold. These are
single local wall-time observations, not production latency guarantees.
Concurrent cold requests can repeat work and share an isolate's memory budget;
the per-address rate limit does not serialize requests across clients.
Repeat parity and cache tests when changing the site release, since roughness
can legitimately change the parking location and routes.

With `sites-v2`, all four drive/walk plans again match the browser algorithm
byte-for-byte. The packaged Worker returned the nearest route in about 1.7 s
uncached and 11 ms cached; the other sites took about 1.3–4.0 s uncached.
The cache revision changed when both site roots moved to `sites-v2`, so old
results without roughness are not reused. The map's Check step also rendered
the nearest route, both comparisons and their profiles from the new response.
