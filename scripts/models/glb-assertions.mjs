import assert from "node:assert/strict";

// Float32 geometry tolerates micrometre-scale absolute and one-part-per-million relative drift.
const absoluteTolerance = 1e-6;
const relativeTolerance = 1e-6;

export function assertClose(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: non-finite value`);
  const tolerance =
    absoluteTolerance + relativeTolerance * Math.max(Math.abs(actual), Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differs from ${expected}`,
  );
}

export function decodeGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  assert.equal(binaryLength, document.buffers[0].byteLength);
  assert.equal(binaryHeader + 8 + binaryLength, bytes.length);
  assert.equal(binaryLength % 4, 0);
  return { document, binary: bytes.subarray(binaryHeader + 8) };
}

export function assertEquivalentGlb(actualBytes, expectedBytes) {
  const actual = decodeGlb(actualBytes);
  const expected = decodeGlb(expectedBytes);
  const structure = (document) => ({
    ...document,
    accessors: document.accessors.map(({ min: _min, max: _max, ...accessor }) => accessor),
    materials: document.materials.map((material) => ({
      ...material,
      pbrMetallicRoughness: { ...material.pbrMetallicRoughness, baseColorFactor: undefined },
    })),
  });
  assert.deepEqual(structure(actual.document), structure(expected.document));
  const compareArray = (a, b, label) => {
    assert.equal(a?.length, b?.length, label);
    a?.forEach((value, index) => assertClose(value, b[index], `${label}[${index}]`));
  };
  actual.document.accessors.forEach((accessor, index) => {
    for (const bound of ["min", "max"]) {
      compareArray(
        accessor[bound],
        expected.document.accessors[index][bound],
        `accessor ${index} ${bound}`,
      );
    }
  });
  actual.document.materials.forEach((material, index) => {
    compareArray(
      material.pbrMetallicRoughness.baseColorFactor,
      expected.document.materials[index].pbrMetallicRoughness.baseColorFactor,
      `material ${index} color`,
    );
  });
  for (const accessor of actual.document.accessors) {
    assert.equal(accessor.componentType, 5126);
    assert.equal(accessor.type, "VEC3");
  }
  assert.equal(actual.binary.length, expected.binary.length);
  for (let offset = 0; offset < actual.binary.length; offset += 4) {
    assertClose(
      actual.binary.readFloatLE(offset),
      expected.binary.readFloatLE(offset),
      `geometry byte ${offset}`,
    );
  }
}
