// Driving terrain: a 463 m strip cut from the MGS MOLA global DEM (USGS Astrogeology) with HTTP
// range requests, no GDAL. Writes Int16 little-endian heights (rows north to south) and a JSON
// with the grid placement to public/data/processed/rover/. Usage: pnpm pipe:mola-corridor
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE =
  "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif";
// East-positive and continuous across ±180°: 171..180 and −180..−164 in the file's longitudes.
const EXTENT = { west: 171, east: 196, south: 42.5, north: 48.5 };
const HABITAT = { lng: 183.95, lat: 45.97 };
const OUT_DIR = "public/data/processed/rover";
const CONCURRENCY = 8;
const RETRIES = 4;

const TAG = {
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  sampleFormat: 339,
  pixelScale: 33550,
  tiepoint: 33922,
  geoKeys: 34735,
  geoDoubles: 34736,
  nodata: 42113,
};
const GEO_KEY = {
  semiMajorAxis: 2057,
  standardParallel: 3078,
  falseEasting: 3082,
  falseNorthing: 3083,
  centerLongitude: 3088,
};
const TYPE_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };

let requests = 0;

async function fetchRange(start: number, length: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      requests++;
      const response = await fetch(SOURCE, {
        headers: { Range: `bytes=${start}-${start + length - 1}` },
      });
      if (response.status !== 206) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== length) throw new Error(`got ${bytes.length} of ${length} bytes`);
      return bytes;
    } catch (error) {
      if (attempt > RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/** Reads every tag of the first IFD of a classic little-endian TIFF as numbers (or a string for ASCII). */
async function readTags(): Promise<Map<number, number[] | string>> {
  const header = await fetchRange(0, 8);
  if (header.toString("latin1", 0, 2) !== "II" || header.readUInt16LE(2) !== 42) {
    throw new Error("Not a classic little-endian TIFF");
  }
  const ifdOffset = header.readUInt32LE(4);
  const count = (await fetchRange(ifdOffset, 2)).readUInt16LE(0);
  const entries = await fetchRange(ifdOffset + 2, count * 12);
  const tags = new Map<number, number[] | string>();
  for (let i = 0; i < count; i++) {
    const entry = entries.subarray(i * 12, i * 12 + 12);
    tags.set(entry.readUInt16LE(0), await readEntryValues(entry));
  }
  return tags;
}

async function readEntryValues(entry: Buffer): Promise<number[] | string> {
  const type = entry.readUInt16LE(2);
  const count = entry.readUInt32LE(4);
  const size = TYPE_BYTES[type];
  if (!size) throw new Error(`Unsupported TIFF type ${type}`);
  // Values that fit in four bytes are stored inside the entry; larger ones live at an offset.
  const bytes =
    size * count <= 4 ? entry.subarray(8) : await fetchRange(entry.readUInt32LE(8), size * count);
  if (type === 2) return bytes.toString("latin1", 0, count).replace(/\0.*$/, "");
  const read = (i: number) =>
    type === 1
      ? bytes[i]
      : type === 3
        ? bytes.readUInt16LE(i * 2)
        : type === 4
          ? bytes.readUInt32LE(i * 4)
          : bytes.readDoubleLE(i * 8);
  return Array.from({ length: count }, (_, i) => read(i));
}

function numbers(tags: Map<number, number[] | string>, tag: number): number[] {
  const values = tags.get(tag);
  if (!Array.isArray(values)) throw new Error(`Missing numeric TIFF tag ${tag}`);
  return values;
}

/** A double-valued GeoKey (stored in GeoDoubleParams), or 0 when the file leaves it out. */
function geoDouble(tags: Map<number, number[] | string>, key: number): number {
  const directory = numbers(tags, TAG.geoKeys);
  for (let i = 4; i < directory.length; i += 4) {
    if (directory[i] === key) return numbers(tags, TAG.geoDoubles)[directory[i + 3]];
  }
  return 0;
}

/** Maps lon/lat on the file's sphere to fractional pixel column and row (equirectangular, pixel-is-area). */
function pixelMapper(tags: Map<number, number[] | string>) {
  const [scaleX, scaleY] = numbers(tags, TAG.pixelScale);
  const [tieI, tieJ, , tieX, tieY] = numbers(tags, TAG.tiepoint);
  const metresPerDegree = (geoDouble(tags, GEO_KEY.semiMajorAxis) * Math.PI) / 180;
  const parallel = Math.cos((geoDouble(tags, GEO_KEY.standardParallel) * Math.PI) / 180);
  const centre = geoDouble(tags, GEO_KEY.centerLongitude);
  const falseEasting = geoDouble(tags, GEO_KEY.falseEasting);
  const falseNorthing = geoDouble(tags, GEO_KEY.falseNorthing);
  return {
    column: (lng: number) =>
      tieI + (metresPerDegree * parallel * (lng - centre) + falseEasting - tieX) / scaleX,
    row: (lat: number) => tieJ + (tieY - (metresPerDegree * lat + falseNorthing)) / scaleY,
    degreesPerPixel: scaleY / metresPerDegree,
  };
}

// The file's pixel scale is rounded (463.0935 m), so its tags overshoot 360° by about a pixel and
// put requested edges up to half a pixel off; snap to the nearest pixel edge and log how far.
function nearestEdge(value: number, what: string): number {
  const edge = Math.round(value);
  console.log(`${what}: pixel ${value.toFixed(3)} → ${edge}`);
  return edge;
}

async function inBatches<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

function checkFormat(tags: Map<number, number[] | string>): void {
  const expect = (tag: number, value: number, what: string) => {
    if (numbers(tags, tag)[0] !== value) throw new Error(`Expected ${what}`);
  };
  expect(TAG.bitsPerSample, 16, "16-bit samples");
  expect(TAG.sampleFormat, 2, "signed integers");
  expect(TAG.compression, 1, "no compression");
  expect(TAG.samplesPerPixel, 1, "one band");
  expect(TAG.rowsPerStrip, 1, "one row per strip");
}

const started = Date.now();
const tags = await readTags();
checkFormat(tags);
const fileWidth = numbers(tags, TAG.width)[0];
const stripOffsets = numbers(tags, TAG.stripOffsets);
const nodataText = tags.get(TAG.nodata);
const nodata = typeof nodataText === "string" ? Number(nodataText) : null;
const mapper = pixelMapper(tags);

// Inside a global file ±180° are its first and last pixel edges, so the strip is two column
// ranges per row: 171..180 then −180..−164.
if (Math.abs(mapper.column(-180)) > 1 || Math.abs(mapper.column(180) - fileWidth) > 1) {
  throw new Error("Source does not span −180..180");
}
const ranges = [
  [nearestEdge(mapper.column(EXTENT.west), "171° E"), fileWidth],
  [0, nearestEdge(mapper.column(EXTENT.east - 360), "196° E")],
];
const width = ranges.reduce((sum, [from, to]) => sum + to - from, 0);
const firstRow = nearestEdge(mapper.row(EXTENT.north), "48.5° N");
const height = nearestEdge(mapper.row(EXTENT.south), "42.5° N") - firstRow;
const degreesPerPixel = (EXTENT.east - EXTENT.west) / width;
if (
  Math.abs(degreesPerPixel / mapper.degreesPerPixel - 1) > 1e-4 ||
  Math.abs((EXTENT.north - EXTENT.south) / height - degreesPerPixel) > 1e-12
) {
  throw new Error("Snapped strip does not match the file's pixel size");
}

const heights = Buffer.alloc(width * height * 2);
const pieces = Array.from({ length: height }, (_, row) => {
  let outColumn = 0;
  return ranges.map(([from, to]) => {
    const piece = { row, outColumn, from, columns: to - from };
    outColumn += to - from;
    return piece;
  });
}).flat();
// The file stores Int16 little-endian, the same as the output, so bytes are copied as they are.
await inBatches(pieces, async ({ row, outColumn, from, columns }) => {
  const bytes = await fetchRange(stripOffsets[firstRow + row] + from * 2, columns * 2);
  bytes.copy(heights, (row * width + outColumn) * 2);
});

const habitatColumn = Math.floor((HABITAT.lng - EXTENT.west) / degreesPerPixel);
const habitatRow = Math.floor((EXTENT.north - HABITAT.lat) / degreesPerPixel);
const habitatHeight = heights.readInt16LE((habitatRow * width + habitatColumn) * 2);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "mola-corridor.bin"), heights);
const meta = {
  width,
  height,
  west: EXTENT.west,
  north: EXTENT.north,
  degreesPerPixel,
  nodata,
  source: SOURCE,
  sha256: createHash("sha256").update(heights).digest("hex"),
  extent: EXTENT,
  note: "Int16 metres above the MOLA areoid, rows north to south, longitudes 171–196° E continuous. A display and route-planning input, not a hazard certification.",
};
writeFileSync(join(OUT_DIR, "mola-corridor.json"), `${JSON.stringify(meta, null, 2)}\n`);

console.log(
  `${width}×${height} cells, ${heights.length} bytes, ${requests} requests, ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
console.log(`Habitat (${HABITAT.lng}° E, ${HABITAT.lat}° N): ${habitatHeight} m`);
