import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cross, dot, encodeGlb, Model, normalize, subtract } from "./geometry.mjs";
import { buildHab, buildMav, buildRover } from "./vehicles.mjs";

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
    assert.equal(bounds.min[1], 0);
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

  test(`${model.id} GLB is self-contained and reproducible`, () => {
    const bytes = encodeGlb(model);
    assert.deepEqual(bytes, readFileSync(new URL(`${model.id}.glb`, output)));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    assert.equal(jsonLength % 4, 0);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binaryHeader = 20 + jsonLength;
    assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
    assert.equal(bytes.readUInt32LE(binaryHeader), document.buffers[0].byteLength);
    assert.equal(binaryHeader + 8 + document.buffers[0].byteLength, bytes.length);
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
    assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(entry.byte_length, bytes.length);
    assert.equal(entry.triangles, model.triangles.length);
  });
}
