import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cross, dot, encodeGlb, Model, normalize, subtract } from "./geometry.mjs";
import { buildHab, buildMav, buildRover } from "./vehicles.mjs";
import { assertClose, assertEquivalentGlb, decodeGlb } from "./glb-assertions.mjs";

const output = new URL("../../public/models/mars/", import.meta.url);

test("box normals point outwards on every face", () => {
  const model = new Model("box", "Box");
  model.box([0, 0, 0], [2, 2, 2], 0);
  assert.equal(model.triangles.length, 12);
  for (const triangle of model.triangles) {
    const center = [0, 1, 2].map(
      (axis) => triangle.vertices.reduce((sum, p) => sum + p[axis], 0) / 3,
    );
    assert.ok(dot(center, triangle.normal) > 0);
  }
});

test("cylinder normals and winding face outwards", () => {
  const model = new Model("cylinder", "Cylinder");
  model.cylinder([0, -1, 0], [0, 1, 0], 1, 0);
  for (const triangle of model.triangles) {
    const center = [0, 1, 2].map(
      (axis) => triangle.vertices.reduce((sum, p) => sum + p[axis], 0) / 3,
    );
    assert.ok(dot(center, triangle.normal) > 0);
  }
});

for (const build of [buildHab, buildRover, buildMav]) {
  const model = build();
  test(`${model.id} is finite, grounded, and within the mesh budget`, () => {
    assert.ok(model.triangles.length > 1000);
    assert.ok(model.triangles.length < 15000);
    assert.ok(model.parts.length >= 5);
    const bounds = model.bounds();
    assertClose(bounds.min[1], 0, "ground height");
    assert.ok(bounds.max.every((value, axis) => value > bounds.min[axis]));
    for (const triangle of model.triangles) {
      assert.ok(triangle.vertices.flat().every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...triangle.normal) - 1) < 1e-6);
      const calculated = normalize(
        cross(
          subtract(triangle.vertices[1], triangle.vertices[0]),
          subtract(triangle.vertices[2], triangle.vertices[0]),
        ),
      );
      assert.ok(dot(calculated, triangle.normal) > 0.99999);
    }
  });

  test(`${model.id} GLB is self-contained and geometrically reproducible`, () => {
    const bytes = encodeGlb(model);
    assert.deepEqual(bytes, encodeGlb(build()), "repeatable on this runtime");
    const committed = readFileSync(new URL(`${model.id}.glb`, output));
    assertEquivalentGlb(bytes, committed);
    const { document } = decodeGlb(bytes);
    assert.equal(document.images, undefined);
    assert.equal(document.buffers[0].uri, undefined);
    assert.equal(document.nodes[0].extras.up, "+Y");
    assert.ok(bytes.length < 1024 * 1024);
    let vertices = 0;
    for (const primitive of document.meshes[0].primitives) {
      const positions = document.accessors[primitive.attributes.POSITION];
      const normals = document.accessors[primitive.attributes.NORMAL];
      assert.equal(positions.count, normals.count);
      assert.equal(positions.count % 3, 0);
      assert.equal(positions.componentType, 5126);
      assert.equal(primitive.mode, 4);
      vertices += positions.count;
    }
    assert.equal(vertices, model.triangles.length * 3);
    for (const view of document.bufferViews) {
      assert.equal(view.byteOffset % 4, 0);
      assert.ok(view.byteOffset + view.byteLength <= document.buffers[0].byteLength);
    }
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", output)));
    const entry = manifest.models.find((entry) => entry.id === model.id);
    assert.equal(entry.sha256, createHash("sha256").update(committed).digest("hex"));
    assert.equal(entry.byte_length, committed.length);
    assert.equal(entry.triangles, model.triangles.length);
  });
}

test("GLB comparison accepts rounding drift but rejects changed or invalid geometry", () => {
  const model = new Model("fixture", "Fixture");
  model.box([0, 0, 0], [2, 2, 2], 0);
  const original = encodeGlb(model);
  const changed = Buffer.from(original);
  const { binary } = decodeGlb(changed);
  const value = binary.readFloatLE(0);
  binary.writeFloatLE(value + 5e-7, 0);
  assert.doesNotThrow(() => assertEquivalentGlb(changed, original));
  binary.writeFloatLE(value + 0.001, 0);
  assert.throws(() => assertEquivalentGlb(changed, original));
  binary.writeFloatLE(NaN, 0);
  assert.throws(() => assertEquivalentGlb(changed, original));
});

test("GLB comparison rejects structural changes", () => {
  const original = new Model("fixture", "Fixture");
  original.box([0, 0, 0], [2, 2, 2], 0);
  const renamed = new Model("changed", "Fixture");
  renamed.box([0, 0, 0], [2, 2, 2], 0);
  assert.throws(() => assertEquivalentGlb(encodeGlb(renamed), encodeGlb(original)));
});

test("GLB comparison tolerates rounded bounds with different JSON lengths", () => {
  const original = new Model("fixture", "Fixture");
  original.box([0, 0, 0], [2, 2, 2], 0);
  const rounded = new Model("fixture", "Fixture");
  rounded.box([0, 0, 0], [2 + 5e-7, 2, 2], 0);
  const a = encodeGlb(original);
  const b = encodeGlb(rounded);
  assert.notEqual(a.length, b.length);
  assert.doesNotThrow(() => assertEquivalentGlb(a, b));
});
