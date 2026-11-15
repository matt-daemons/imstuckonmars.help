import { z } from "zod";

export const DUST_RELEASE = "/data/dust/nasa-2018-v1/";
export const DUST_FIELDS = {
  tau_current: { title: "Dust optical depth", unit: "dimensionless", maximum: 9, scale: 0.001 },
  dst_mass_source: { title: "Surface dust lifting", unit: "kg/m²/s", maximum: 5e-7, scale: 1e-11 },
};
export type DustField = keyof typeof DUST_FIELDS;

const finite = z.number().finite();
const manifestSchema = z.object({
  version: z.literal(1),
  kind: z.literal("model-output"),
  grid: z.object({ width: z.literal(180), height: z.literal(90), stepDegrees: z.literal(2) }),
  time: z.object({
    elapsedSols: z.array(finite).length(128),
    modelDays: z.array(finite).length(128),
    sampleIntervalSols: z.literal(2),
  }),
  fields: z
    .array(
      z.object({
        id: z.enum(["tau_current", "dst_mass_source"]),
        scale: finite.positive(),
        globalMean: z.array(finite.nonnegative()).length(128),
      }),
    )
    .length(2),
  encoding: z.object({
    url: z.literal("fields.bin.gz"),
    type: z.literal("uint16-little-endian"),
    compression: z.literal("gzip"),
    layout: z.literal("frame,field,row,column"),
    missingValue: z.literal(65535),
    bytes: z.number().int().positive().max(5000000),
    decodedBytes: z.literal(8294400),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    decodedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export type DustManifest = z.infer<typeof manifestSchema>;
export interface DustSimulation {
  manifest: DustManifest;
  values: DataView;
}

export function parseDustManifest(input: unknown): DustManifest {
  const manifest = manifestSchema.parse(input);
  manifest.fields.forEach((field, index) => {
    if (
      field.id !== Object.keys(DUST_FIELDS)[index] ||
      field.scale !== DUST_FIELDS[field.id].scale
    ) {
      throw new Error("Unexpected dust field layout");
    }
  });
  manifest.time.elapsedSols.forEach((sol, index) => {
    if (
      sol !== index * 2 ||
      Math.abs(manifest.time.modelDays[index] - manifest.time.modelDays[0] - sol) > 1e-8
    ) {
      throw new Error("Invalid simulation time axis");
    }
  });
  return manifest;
}

export async function loadDustSimulation(signal: AbortSignal): Promise<DustSimulation> {
  const response = await fetch(`${DUST_RELEASE}manifest.json`, { signal });
  if (!response.ok) throw new Error("NASA dust manifest could not be loaded. Retry the download.");
  const manifest = parseDustManifest(await response.json());
  const data = await fetch(`${DUST_RELEASE}${manifest.encoding.url}`, { signal });
  if (!data.ok) throw new Error("NASA dust frames could not be loaded. Retry the download.");
  const values = await decodeDustPayload(await data.arrayBuffer(), manifest);
  return { manifest, values };
}

/** Fetch may transparently decompress gzip; verify the representation actually received. */
export async function decodeDustPayload(
  payload: ArrayBuffer,
  manifest: DustManifest,
): Promise<DataView> {
  const isCompressed = payload.byteLength === manifest.encoding.bytes;
  if (!isCompressed && payload.byteLength !== manifest.encoding.decodedBytes) {
    throw new Error("Incomplete dust download. Retry the download.");
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== (isCompressed ? manifest.encoding.sha256 : manifest.encoding.decodedSha256))
    throw new Error("Dust checksum mismatch. Retry the download.");
  const decoded = isCompressed
    ? await new Response(
        new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer()
    : payload;
  if (decoded.byteLength !== manifest.encoding.decodedBytes)
    throw new Error("Invalid dust frame size.");
  return new DataView(decoded);
}

/** Native grid cell lookup. Wrap longitude, but do not synthesize missing values. */
export function dustValue(
  simulation: DustSimulation,
  frame: number,
  field: DustField,
  longitude: number,
  latitude: number,
): number | null {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= simulation.manifest.time.elapsedSols.length ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  )
    return null;
  const column = Math.floor(((((longitude + 180) % 360) + 360) % 360) / 2);
  const row = Math.min(89, Math.floor((90 - latitude) / 2));
  const fieldIndex = field === "tau_current" ? 0 : 1;
  const value = simulation.values.getUint16(
    ((frame * 2 + fieldIndex) * 180 * 90 + row * 180 + column) * 2,
    true,
  );
  return value === 65535 ? null : value * DUST_FIELDS[field].scale;
}

export function nextDustFrame(frame: number, count: number): number {
  return Math.min(count - 1, frame + 1);
}

// Patches never cross a wrap boundary; exclude polar caps unsupported by Mercator imagery.
export const DUST_PATCHES = [-180, -90, 0, 90].flatMap((west) =>
  [0, -80].map((south) => ({
    west,
    east: west + 90,
    south,
    north: south + 80,
    id: `nasa-dust-${west}-${south}`,
  })),
);
