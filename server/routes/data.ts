import { terrainPng } from "./png";
import type { Fetcher } from "@cloudflare/workers-types";
import { mapAsset, SITE_DATA_ROOT } from "../../lib/mars/map-data";
import { ROUGHNESS_DATA_ROOT } from "../../lib/mars/ground-layers";
import { gridFromEquirect, gridFromTiles } from "../../lib/mars/route-grid";
import {
  BOULDER_CLEARANCE_M,
  assertAlignedSiteRasters,
  readWindow,
  SITE_CELL_M,
  siteGridFromSlope,
  type SiteInfo,
} from "../../lib/mars/site-grid";
import { MissionError } from "../../lib/mission/types";
import { z } from "zod";
import { BaseClient, BaseResponse, fromCustomClient } from "geotiff";

/** Range reads only, with a total transfer budget for each fixed release raster. */
export class PlannerTerrainClient extends BaseClient {
  private bytes = 0;
  private requests = 0;

  override async request(options: RequestInit = {}): Promise<BaseResponse> {
    const range = new Headers(options.headers).get("Range");
    const match = range?.match(/^bytes=(\d+)-(\d+)$/);
    if (!match || ++this.requests > 128) throw new Error("Invalid planner terrain range request");
    const length = Number(match[2]) - Number(match[1]) + 1;
    this.bytes += length;
    if (length <= 0 || length > 8_000_000 || this.bytes > 32_000_000) {
      throw new Error("Planner terrain exceeds its transfer limit");
    }
    const response = await fetch(this.url, { ...options, redirect: "manual" });
    const contentRange = response.headers.get("Content-Range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (
      response.status !== 206 ||
      !contentRange ||
      Number(contentRange[1]) !== Number(match[1]) ||
      Number(contentRange[2]) > Number(match[2])
    ) {
      await response.body?.cancel();
      throw new Error("Planner terrain requires a matching partial response");
    }
    const data = await boundedBytes(response, length);
    if (data.byteLength !== Number(contentRange[2]) - Number(contentRange[1]) + 1)
      throw new Error("Incomplete planner terrain range");
    return new (class extends BaseResponse {
      override get status() {
        return response.status;
      }
      override getHeader(name: string) {
        return response.headers.get(name) ?? undefined;
      }
      override async getData() {
        return data;
      }
    })();
  }
}

const openPlannerTiff: typeof import("geotiff").fromUrl = (url, options, signal) => {
  // GeoTIFF accepts these blocked-source options but omits them from RemoteSourceOptions.
  const blockedOptions = { ...options, blockSize: 1024 * 1024, cacheSize: 16 };
  return fromCustomClient(new PlannerTerrainClient(url), blockedOptions, signal);
};

export async function boundedBytes(
  response: Pick<Response, "ok"> & {
    body: {
      getReader(): {
        read(): Promise<{ done: boolean; value?: Uint8Array }>;
        cancel(): Promise<void>;
        releaseLock(): void;
      };
    } | null;
  },
  limit: number,
): Promise<ArrayBuffer> {
  if (!response.ok || !response.body)
    throw new MissionError(
      "terrain_unavailable",
      "Planning terrain could not be loaded. Retry the route.",
      503,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Planner asset exceeds its size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}

export function plannerAssets(assets: Fetcher, localOrigin?: string) {
  const signal = AbortSignal.timeout(60_000);
  const asset = async (path: string, limit: number) =>
    boundedBytes(
      await (localOrigin
        ? fetch(new URL(path, localOrigin), { signal, redirect: "manual" })
        : assets.fetch(`https://imstuckonmars.help${path}`)),
      limit,
    );
  const json = async (path: string, limit = 1_000_000): Promise<unknown> =>
    JSON.parse(new TextDecoder().decode(await asset(path, limit)));
  return { asset, json, signal };
}

export async function loadPlannerBase(signal: AbortSignal) {
  const tiles: Uint8Array[][] = [];
  for (const y of [364, 365]) {
    const row: Uint8Array[] = [];
    for (const x of [10, 11]) {
      const bytes = await boundedBytes(
        await fetch(mapAsset(`legacy/display/hab/10/${x}/${y}.png`), {
          signal,
          redirect: "manual",
        }),
        1_000_000,
      );
      // Check dimensions before PNG decompression can allocate an attacker-sized image.
      const header = new DataView(bytes);
      if (bytes.byteLength < 24 || header.getUint32(16) !== 256 || header.getUint32(20) !== 256)
        throw new Error("Unexpected base tile dimensions");
      row.push(await terrainPng(bytes));
    }
    tiles.push(row);
  }
  return gridFromTiles(10, 10, 364, tiles);
}

export async function loadPlannerDrive(source: ReturnType<typeof plannerAssets>) {
  const meta = z
    .object({
      width: z.literal(3200),
      height: z.literal(768),
      west: z.number().finite(),
      north: z.number().finite(),
      degreesPerPixel: z.number().positive(),
      nodata: z.number().nullable(),
    })
    .parse(await source.json("/data/processed/rover/mola-corridor.json"));
  const count = meta.width * meta.height;
  const heights = await source.asset("/data/processed/rover/mola-corridor.bin", count * 2);
  const ground = await source.asset(
    "/data/processed/rover/thermal-inertia-corridor.bin",
    count * 2,
  );
  if (heights.byteLength !== count * 2 || ground.byteLength !== count * 2)
    throw new Error("Incomplete drive grid");
  return {
    ...gridFromEquirect(meta, new Int16Array(heights)),
    thermalInertia: new Int16Array(ground),
  };
}

export async function loadPlannerSite(site: SiteInfo, source: ReturnType<typeof plannerAssets>) {
  if (!SITE_DATA_ROOT) throw new Error("Site terrain release is unavailable");
  const slope = await readWindow(
    `${SITE_DATA_ROOT}/slope/${site.hiriseId}_slope.tif`,
    site,
    source.signal,
    openPlannerTiff,
  );
  const raw = z
    .object({
      features: z.array(
        z.object({
          geometry: z.object({ coordinates: z.tuple([z.number().finite(), z.number().finite()]) }),
          properties: z.object({ site: z.string(), diameter_m: z.number().finite().nonnegative() }),
        }),
      ),
    })
    .parse(await source.json("/data/processed/boulders.geojson", 8_000_000));
  const boulders = raw.features
    .filter((feature) => feature.properties.site === site.id)
    .map((feature) => ({
      center: feature.geometry.coordinates,
      radius_m: feature.properties.diameter_m / 2 + BOULDER_CLEARANCE_M,
    }));
  const roughness = ROUGHNESS_DATA_ROOT
    ? await readWindow(
        `${ROUGHNESS_DATA_ROOT}/roughness/${site.hiriseId}_roughness.tif`,
        site,
        source.signal,
        openPlannerTiff,
      )
    : null;
  if (roughness) assertAlignedSiteRasters(slope.meta, roughness.meta);
  return siteGridFromSlope(
    slope.meta,
    slope.values,
    boulders,
    SITE_CELL_M,
    roughness?.values ?? null,
  );
}
