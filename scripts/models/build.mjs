import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodeGlb, renderPreview } from "./geometry.mjs";
import { buildHab, buildMav, buildRover } from "./vehicles.mjs";

const directory = fileURLToPath(new URL("../../public/models/mars/", import.meta.url));
mkdirSync(directory, { recursive: true });
const models = [];
for (const build of [buildHab, buildRover, buildMav]) {
  const model = build();
  const glb = encodeGlb(model);
  writeFileSync(`${directory}${model.id}.glb`, glb);
  writeFileSync(`${directory}${model.id}.png`, renderPreview(model));
  writeFileSync(`${directory}${model.id}-rear.png`, renderPreview(model, Math.PI + 0.65));
  const bounds = model.bounds();
  models.push({
    id: model.id,
    title: model.title,
    path: `/models/mars/${model.id}.glb`,
    preview: `/models/mars/${model.id}.png`,
    rear_preview: `/models/mars/${model.id}-rear.png`,
    byte_length: glb.length,
    sha256: createHash("sha256").update(glb).digest("hex"),
    triangles: model.triangles.length,
    bounds_m: bounds,
    dimensions_m: bounds.max.map((max, axis) => Number((max - bounds.min[axis]).toFixed(3))),
    parts: model.parts,
  });
  console.log(
    `${model.id}: ${model.triangles.length} triangles, ${Math.round(glb.length / 1024)} KiB`,
  );
}
writeFileSync(
  `${directory}manifest.json`,
  JSON.stringify(
    {
      version: 1,
      license: "MIT",
      attribution:
        "Original LARA conceptual assets, 2026 matt-daemons. Not film assets or NASA hardware models.",
      units: "meters",
      coordinates: {
        handedness: "right",
        up: "+Y",
        forward: "+Z",
        origin: "ground-level footprint center",
      },
      limitations:
        "Illustrative dimensions and equipment only. No engineering, life-support, performance or safety validation.",
      models,
    },
    null,
    2,
  ) + "\n",
);
