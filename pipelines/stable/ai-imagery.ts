// Reproject a generated visual experiment; never read or write elevation assets.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { execa } from "execa";

const root = "public/data/terrain/ctx";
const input = `${root}/ai-input.jpg`;
const generated = `${root}/ai-visual-experiment.png`;
const work = "data/interim/ctx";
await mkdir(work, { recursive: true });
await execa("gdal_translate", [
  "-q",
  "-of",
  "VRT",
  "-a_srs",
  "EPSG:4326",
  "-a_ullr",
  "-176.0888671875",
  "46.0107421875",
  "-176.044921875",
  "45.966796875",
  generated,
  `${work}/ai-display.vrt`,
]);
await execa("gdalwarp", [
  "-q",
  "-overwrite",
  "-t_srs",
  "EPSG:3857",
  "-r",
  "bilinear",
  `${work}/ai-display.vrt`,
  `${work}/ai-display.tif`,
]);
await execa("gdal_translate", ["-q", "-of", "PNG", `${work}/ai-display.tif`, `${root}/ai-map.png`]);
await rm(`${root}/ai-map.png.aux.xml`, { force: true });
const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
await writeFile(
  `${root}/ai-provenance.json`,
  JSON.stringify(
    {
      id: "ares-ai-imagery-experiment-v1",
      kind: "AI-generated visual experiment",
      model: "openai/gpt-image-2",
      input,
      inputSha256: await hash(input),
      generated,
      generatedSha256: await hash(generated),
      output: `${root}/ai-map.png`,
      outputSha256: await hash(`${root}/ai-map.png`),
      sourceUrl:
        "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer/tile/12/1001/89",
      generatedPixelsAreNotMeasurements: true,
      allowedUse: "Optional visual comparison only",
      defaultVisible: false,
      forbiddenUses: ["elevation", "slope", "hazard detection", "routing", "resource calculation"],
      prompt:
        "Use case: scientific-educational visual experiment, NOT scientific data. Edit target: the attached grayscale Mars orbital CTX image. Produce a conservative 2x visual upscale to 1024x1024. Keep exactly the same orthographic overhead footprint, geometry, edge content, dark streak locations, brightness and monochrome appearance. Only reduce JPEG noise and improve local edge clarity. Do not create craters, boulders, ridges, dunes, roads, buildings, shadows, text, labels, borders, or new landforms. Do not rotate, crop, warp, recolor, or change lighting. Fine generated pixels will be labeled unverified in the application and never used for elevation or navigation. No text in the image.",
      review:
        "Broad structures remain recognizable, but fine texture changed. Not a recovery of measured detail; geometric alignment is unvalidated.",
      processing:
        "Generated image assigned the input footprint, then warped for Mapbox display only. Assignment does not certify pixel registration.",
    },
    null,
    2,
  ) + "\n",
);
