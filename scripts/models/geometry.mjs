import { deflateSync } from "node:zlib";

export const materials = [
  { name: "Ceramic insulation", color: [0.79, 0.76, 0.66], metallic: 0.1, roughness: 0.72 },
  { name: "Graphite structure", color: [0.075, 0.085, 0.09], metallic: 0.65, roughness: 0.48 },
  { name: "Brushed titanium", color: [0.38, 0.41, 0.43], metallic: 0.8, roughness: 0.38 },
  { name: "Rescue orange", color: [0.86, 0.19, 0.055], metallic: 0.15, roughness: 0.56 },
  { name: "Blue-black glazing", color: [0.035, 0.12, 0.16], metallic: 0.72, roughness: 0.16 },
  { name: "Solar cells", color: [0.035, 0.055, 0.11], metallic: 0.5, roughness: 0.3 },
  { name: "Tire composite", color: [0.028, 0.033, 0.037], metallic: 0.05, roughness: 0.95 },
  { name: "Gold thermal foil", color: [0.63, 0.38, 0.09], metallic: 0.72, roughness: 0.44 },
  { name: "White markings", color: [0.94, 0.94, 0.88], metallic: 0, roughness: 0.65 },
];

export const subtract = (a, b) => a.map((value, i) => value - b[i]);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const normalize = (v) => {
  const length = Math.hypot(...v);
  if (length < 1e-10) throw new Error("Degenerate vector");
  return v.map((value) => value / length);
};

export class Model {
  triangles = [];
  parts = [];

  constructor(id, title) {
    this.id = id;
    this.title = title;
  }

  part(name, make) {
    const start = this.triangles.length;
    make();
    this.parts.push({ name, triangles: this.triangles.length - start });
  }

  triangle(a, b, c, material) {
    const normal = cross(subtract(b, a), subtract(c, a));
    if (Math.hypot(...normal) < 1e-9) return;
    this.triangles.push({ vertices: [a, b, c], normal: normalize(normal), material });
  }

  quad(a, b, c, d, material) {
    this.triangle(a, b, c, material);
    this.triangle(a, c, d, material);
  }

  box(center, size, material, yaw = 0) {
    const points = [];
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        for (const x of [-0.5, 0.5]) {
          const dx = x * size[0];
          const dz = z * size[2];
          points.push([
            center[0] + dx * Math.cos(yaw) + dz * Math.sin(yaw),
            center[1] + y * size[1],
            center[2] - dx * Math.sin(yaw) + dz * Math.cos(yaw),
          ]);
        }
      }
    }
    for (const face of [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ])
      this.quad(...face.toReversed().map((i) => points[i]), material);
  }

  // A radial profile along the line from start to end. Distances and radii are meters.
  lathe(start, end, profile, material, segments = 32) {
    const axis = normalize(subtract(end, start));
    const u = normalize(cross(Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1], axis));
    const v = cross(axis, u);
    const point = (distance, radius, angle) =>
      start.map(
        (value, i) =>
          value + axis[i] * distance + radius * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)),
      );
    for (let p = 0; p < profile.length - 1; p++) {
      for (let s = 0; s < segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        const b = ((s + 1) / segments) * Math.PI * 2;
        this.quad(
          point(...profile[p], a),
          point(...profile[p], b),
          point(...profile[p + 1], b),
          point(...profile[p + 1], a),
          material,
        );
      }
    }
    const first = profile[0];
    const last = profile.at(-1);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const b = ((s + 1) / segments) * Math.PI * 2;
      this.triangle(point(first[0], 0, 0), point(...first, b), point(...first, a), material);
      this.triangle(point(last[0], 0, 0), point(...last, a), point(...last, b), material);
    }
  }

  cylinder(start, end, radius, material, segments = 24) {
    this.lathe(
      start,
      end,
      [
        [0, radius],
        [Math.hypot(...subtract(end, start)), radius],
      ],
      material,
      segments,
    );
  }

  ring(y, radius, thickness, material, x = 0, z = 0, segments = 48) {
    this.lathe(
      [x, y, z],
      [x, y + 1, z],
      [
        [0, radius],
        [thickness, radius],
      ],
      material,
      segments,
    );
  }

  // Extrude a convex counter-clockwise XY polygon toward +Z.
  extrude(points, back, front, material) {
    for (let i = 1; i < points.length - 1; i++) {
      this.triangle(
        [...points[0], front],
        [...points[i], front],
        [...points[i + 1], front],
        material,
      );
      this.triangle([...points[0], back], [...points[i + 1], back], [...points[i], back], material);
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      this.quad([...a, back], [...b, back], [...b, front], [...a, front], material);
    }
  }

  bounds() {
    const points = this.triangles.flatMap((triangle) => triangle.vertices);
    return {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]))),
    };
  }

  ground() {
    const offset = this.bounds().min[1];
    for (const triangle of this.triangles) {
      triangle.vertices = triangle.vertices.map(([x, y, z]) => [x, y - offset, z]);
    }
    return this;
  }
}

function linear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function encodeGlb(model) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const primitives = [];
  let byteOffset = 0;
  const append = (values, type, target, bounds) => {
    const data = Buffer.alloc(values.length * 4);
    values.forEach((value, i) => data.writeFloatLE(value, i * 4));
    chunks.push(data);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length, target });
    byteOffset += data.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: values.length / 3,
      type,
      ...bounds,
    });
    return accessors.length - 1;
  };
  for (let material = 0; material < materials.length; material++) {
    const triangles = model.triangles.filter((triangle) => triangle.material === material);
    if (!triangles.length) continue;
    const positions = triangles.flatMap((triangle) => triangle.vertices.flat());
    const normals = triangles.flatMap((triangle) =>
      Array.from({ length: 3 }, () => triangle.normal).flat(),
    );
    const min = [0, 1, 2].map((axis) => Math.min(...positions.filter((_, i) => i % 3 === axis)));
    const max = [0, 1, 2].map((axis) => Math.max(...positions.filter((_, i) => i % 3 === axis)));
    primitives.push({
      attributes: {
        POSITION: append(positions, "VEC3", 34962, { min, max }),
        NORMAL: append(normals, "VEC3", 34962),
      },
      material,
      mode: 4,
    });
  }
  const document = {
    asset: {
      version: "2.0",
      generator: "ARES original procedural models",
      copyright: "2026 matt-daemons, MIT",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: model.title,
        mesh: 0,
        extras: {
          units: "meters",
          up: "+Y",
          forward: "+Z",
          origin: "ground-level footprint center",
          conceptual: true,
        },
      },
    ],
    meshes: [{ name: model.id, primitives }],
    materials: materials.map(({ name, color, metallic, roughness }) => ({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...color.map(linear), 1],
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const padding = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const binary = Buffer.concat(chunks);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binaryHeader, binary]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

// Deterministic orthographic geometry preview. No generated imagery or external renderer.
export function renderPreview(model, azimuth = 0.65, width = 1000, height = 900) {
  const direction = normalize([Math.sin(azimuth), 0.62, Math.cos(azimuth)]);
  const right = normalize(cross([0, 1, 0], direction));
  const up = cross(direction, right);
  const project = (p) => [dot(p, right), dot(p, up), dot(p, direction)];
  const projected = model.triangles.flatMap((triangle) => triangle.vertices.map(project));
  const low = [0, 1].map((axis) => Math.min(...projected.map((p) => p[axis])));
  const high = [0, 1].map((axis) => Math.max(...projected.map((p) => p[axis])));
  const scale = Math.min((width * 0.83) / (high[0] - low[0]), (height * 0.78) / (high[1] - low[1]));
  const screen = (p) => [
    (p[0] - (low[0] + high[0]) / 2) * scale + width / 2,
    height * 0.51 - (p[1] - (low[1] + high[1]) / 2) * scale,
    p[2],
  ];
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const tone = 30 + Math.round((13 * y) / height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      pixels[i] = tone;
      pixels[i + 1] = tone + 2;
      pixels[i + 2] = tone + 3;
    }
  }
  const depth = new Float64Array(width * height).fill(-Infinity);
  const light = normalize([-0.5, 1, 0.8]);
  const edge = (a, b, p) => (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
  for (const triangle of model.triangles) {
    if (dot(triangle.normal, direction) <= 0) continue;
    const [a, b, c] = triangle.vertices.map((p) => screen(project(p)));
    const area = edge(a, b, c);
    if (Math.abs(area) < 0.001) continue;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const shade = 0.42 + 0.58 * Math.max(0, dot(triangle.normal, light));
    const color = materials[triangle.material].color.map((channel) =>
      Math.round(channel * shade * 255),
    );
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = [x + 0.5, y + 0.5];
        const wa = edge(b, c, p) / area;
        const wb = edge(c, a, p) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = wa * a[2] + wb * b[2] + wc * c[2];
        const index = y * width + x;
        if (z <= depth[index]) continue;
        depth[index] = z;
        for (let channel = 0; channel < 3; channel++) pixels[index * 3 + channel] = color[channel];
      }
    }
  }
  const rows = [];
  for (let y = 0; y < height; y++)
    rows.push(Buffer.from([0]), pixels.subarray(y * width * 3, (y + 1) * width * 3));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
