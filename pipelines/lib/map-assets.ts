import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { execa } from "execa";

export const releaseRoot = "data/map-assets/mars-v2";
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function download(url: string, path: string, maxBytes: number) {
  try {
    const bytes = await readFile(path);
    if (bytes.length > maxBytes) throw new Error(`Cached file exceeds budget: ${path}`);
    return { url, path, bytes: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Source returned ${response.status}: ${url}`);
      if (Number(response.headers.get("content-length")) > maxBytes)
        throw new Error("Source exceeds byte limit");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Source has no body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Source exceeds byte limit");
        }
        chunks.push(chunk.value);
      }
      const bytes = Buffer.concat(chunks);
      await writeFile(`${path}.partial`, bytes);
      await rename(`${path}.partial`, path);
      return { url, path, bytes: size, sha256: sha256(bytes) };
    } catch (error) {
      failure = error;
    }
  }
  // Some archive/CDN edges reject Node's HTTP client while accepting curl.
  try {
    await execa("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "60",
      "--max-filesize",
      String(maxBytes),
      url,
      "--output",
      `${path}.partial`,
    ]);
    const bytes = await readFile(`${path}.partial`);
    if (bytes.length > maxBytes) throw new Error("Source exceeds byte limit");
    await rename(`${path}.partial`, path);
    return { url, path, bytes: bytes.length, sha256: sha256(bytes) };
  } catch {
    /* Report the original source failure without discarding cached inputs. */
  }
  throw failure;
}

export async function json(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function geographicVrt(path: string, vrt: string, bounds: readonly number[]) {
  await mkdir(dirname(vrt), { recursive: true });
  const [west, south, east, north] = bounds;
  await execa("gdal_translate", [
    "-q",
    "-of",
    "VRT",
    "-a_srs",
    "+proj=longlat +R=3396190 +no_defs",
    "-a_ullr",
    String(west),
    String(north),
    String(east),
    String(south),
    path,
    vrt,
  ]);
}

export async function displayAdapter(vrt: string, path: string) {
  await execa("gdal_translate", ["-q", "-of", "VRT", "-a_srs", "EPSG:4326", vrt, path]);
}

export const lonTile = (longitude: number, zoom: number) =>
  Math.floor(((longitude + 180) / 360) * 2 ** zoom);
export const latTile = (latitude: number, zoom: number) =>
  Math.floor(((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom);
const halfWorld = 20037508.342789244;

export async function imageTiles(
  adapter: string,
  dataset: string,
  minZoom: number,
  maxZoom: number,
  bounds: readonly number[],
  alpha: boolean,
) {
  const assets: { path: string; bytes: number; sha256: string }[] = [];
  const [west, south, east, north] = bounds;
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const count = 2 ** zoom;
    const span = (halfWorld * 2) / count;
    for (
      let x = Math.max(0, lonTile(west, zoom));
      x <= Math.min(count - 1, lonTile(east - 1e-9, zoom));
      x++
    ) {
      for (
        let y = Math.max(0, latTile(north, zoom));
        y <= Math.min(count - 1, latTile(south + 1e-9, zoom));
        y++
      ) {
        const extension = alpha ? "png" : "jpg";
        const relative = `${dataset}/${zoom}/${x}/${y}.${extension}`;
        const output = `${releaseRoot}/${relative}`;
        if (!(await exists(output))) {
          await mkdir(dirname(output), { recursive: true });
          const vrt = `${output}.vrt`;
          await execa("gdalwarp", [
            "-q",
            "-overwrite",
            "-of",
            "VRT",
            "-t_srs",
            "EPSG:3857",
            "-te",
            String(-halfWorld + x * span),
            String(halfWorld - (y + 1) * span),
            String(-halfWorld + (x + 1) * span),
            String(halfWorld - y * span),
            "-ts",
            "256",
            "256",
            "-r",
            "bilinear",
            ...(alpha ? ["-dstalpha"] : []),
            adapter,
            vrt,
          ]);
          await execa(
            "gdal_translate",
            [
              "-q",
              "-of",
              alpha ? "PNG" : "JPEG",
              ...(!alpha ? ["-co", "QUALITY=90"] : []),
              vrt,
              output,
            ],
            { env: { GDAL_PAM_ENABLED: "NO" } },
          );
        }
        const bytes = await readFile(output);
        assets.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  return assets;
}
