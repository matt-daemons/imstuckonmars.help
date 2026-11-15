import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DUST_FIELDS,
  decodeDustPayload,
  DUST_PATCHES,
  dustValue,
  nextDustFrame,
  parseDustManifest,
} from "./dust-simulation";
import { dustColor } from "./dust-field";

const manifest = parseDustManifest(
  JSON.parse(readFileSync("public/data/dust/nasa-2018-v1/manifest.json", "utf8")),
);
const compressed = readFileSync("public/data/dust/nasa-2018-v1/fields.bin.gz");
const bytes = gunzipSync(compressed);
const simulation = {
  manifest,
  values: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
};

describe("NASA dust playback", () => {
  it("accepts both gzip bytes and a transparently decompressed HTTP response", async () => {
    const gzipBuffer = new Uint8Array(compressed).buffer;
    const decodedBuffer = new Uint8Array(bytes).buffer;
    const fromGzip = await decodeDustPayload(gzipBuffer, manifest);
    const fromDecoded = await decodeDustPayload(decodedBuffer, manifest);
    expect(fromGzip.byteLength).toBe(bytes.byteLength);
    expect(fromGzip.getUint16(0, true)).toBe(fromDecoded.getUint16(0, true));
    const corrupt = decodedBuffer.slice(0);
    new Uint8Array(corrupt)[0] ^= 1;
    await expect(decodeDustPayload(corrupt, manifest)).rejects.toThrow("checksum");
    await expect(decodeDustPayload(new ArrayBuffer(10), manifest)).rejects.toThrow("Incomplete");
  });
  it("ships intact bounded model data with a deterministic time axis", () => {
    expect(createHash("sha256").update(compressed).digest("hex")).toBe(manifest.encoding.sha256);
    expect(bytes.byteLength).toBe(manifest.encoding.decodedBytes);
    expect(manifest.time.elapsedSols[0]).toBe(0);
    expect(manifest.time.elapsedSols.at(-1)).toBe(254);
    expect(manifest.fields[0].globalMean[56]).toBeGreaterThan(
      manifest.fields[0].globalMean[0] * 10,
    );
    expect(manifest.fields[0].globalMean.at(-1)).toBeLessThan(manifest.fields[0].globalMean[56]);
  });
  it("wraps longitude consistently and does not return invalid frames", () => {
    expect(dustValue(simulation, 56, "tau_current", -179, 45)).toBe(
      dustValue(simulation, 56, "tau_current", 181, 45),
    );
    expect(dustValue(simulation, -1, "tau_current", 0, 0)).toBeNull();
    expect(dustValue(simulation, 128, "tau_current", 0, 0)).toBeNull();
    expect(dustValue(simulation, 0, "tau_current", 0, 91)).toBeNull();
  });
  it("matches source samples after longitude reordering and latitude reversal", () => {
    // Native NetCDF samples independently read at source frame 1344, lat 45, lon 181.
    expect(dustValue(simulation, 56, "tau_current", -179, 45)).toBeCloseTo(0.451, 3);
    expect(dustValue(simulation, 56, "dst_mass_source", -179, 45)).toBeCloseTo(3.128e-8, 11);
    expect(dustValue(simulation, 56, "tau_current", 1, -45)).toBeCloseTo(4.321, 3);
    expect(dustValue(simulation, 0, "tau_current", 1, 89)).toBeCloseTo(0.032, 3);
  });
  it("leaves missing cells transparent rather than inventing dust", () => {
    const missing = new DataView(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    missing.setUint16(0, 65535, true);
    expect(dustValue({ manifest, values: missing }, 0, "tau_current", -179, 89)).toBeNull();
    expect(dustColor(0)[3]).toBe(0);
  });
  it("uses disjoint patches without crossing antimeridian or polar limits", () => {
    expect(DUST_PATCHES).toHaveLength(8);
    for (const patch of DUST_PATCHES) {
      expect(patch.west).toBeGreaterThanOrEqual(-180);
      expect(patch.east).toBeLessThanOrEqual(180);
      expect(patch.north).toBeLessThanOrEqual(80);
      expect(patch.south).toBeGreaterThanOrEqual(-80);
    }
  });
  it("keeps every retained value within the labeled legend range", () => {
    for (let frame = 0; frame < 128; frame++) {
      for (const [fieldIndex, field] of manifest.fields.entries()) {
        let maximum = 0;
        for (let cell = 0; cell < 180 * 90; cell++) {
          const value = simulation.values.getUint16(
            ((frame * 2 + fieldIndex) * 180 * 90 + cell) * 2,
            true,
          );
          if (value !== 65535) maximum = Math.max(maximum, value * field.scale);
        }
        expect(maximum).toBeLessThanOrEqual(DUST_FIELDS[field.id].maximum);
      }
    }
  });
  it("stops at the final frame instead of looping or extrapolating", () => {
    expect(nextDustFrame(127, 128)).toBe(127);
    expect(nextDustFrame(0, 128)).toBe(1);
  });
  it("rejects malformed metadata and changed time intervals", () => {
    expect(() => parseDustManifest({ ...manifest, version: 2 })).toThrow();
    expect(() =>
      parseDustManifest({
        ...manifest,
        time: {
          ...manifest.time,
          elapsedSols: manifest.time.elapsedSols.map((sol, i) => (i === 1 ? 3 : sol)),
        },
      }),
    ).toThrow();
  });
});
