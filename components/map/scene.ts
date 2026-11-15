// 3D scene helpers: MOLA terrain, the habitat model, and the dust-storm effect.
import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MARS_HORIZON_COLOR, MARS_SKY_COLOR, skyBlend } from "@/lib/mars/sky";
import {
  habitatDisplayScale,
  habitatGlobeMatrix,
  habitatProjection,
} from "@/lib/mars/habitat-display";

import type { LngLat } from "@/lib/mars/types";
import {
  GEOLOGY_ATTRIBUTION,
  GEOLOGY_LEGEND,
  REGIONAL_SLOPE_ATTRIBUTION,
  REGIONAL_SLOPE_BOUNDS,
  ROUGHNESS_ATTRIBUTION,
  THERMAL_INERTIA_ATTRIBUTION,
  THERMAL_INERTIA_BOUNDS,
  regionalSlopeTiles,
  roughnessTiles,
  geologyUrl,
  thermalInertiaTiles,
} from "@/lib/mars/ground-layers";
import { GLOBAL_COLOR_SOURCE, SITE_DATA_ROOT, mapAsset } from "@/lib/mars/map-data";
import {
  LOCAL_TERRAIN_BOUNDS,
  LOCAL_TERRAIN_SOURCE,
  MARS_TO_MAP,
  REGIONAL_TERRAIN_SOURCE,
  type SiteTerrain,
  terrainSourceForView,
} from "@/lib/mars/terrain";

type MapLibreGL = typeof import("maplibre-gl");

/**
 * MapLibre sizes the world with Earth's radius, so Mars coordinates render 1.878× too large.
 * Terrain exaggeration of MARS_TO_MAP is true Mars scale; 3D models scale by the same factor.
 */
export { MARS_TO_MAP } from "@/lib/mars/terrain";

export const TERRAIN_SOURCE =
  "MOLA global and regional grids, and a MOLA/HRSC 200 m grid near the habitat";

// HiRISE site terrain sources registered by addSites, consulted by updateTerrain.
let siteTerrains: SiteTerrain[] = [];
export const SITE_ATTRIBUTION = "NASA/JPL/University of Arizona";

export function updateTerrain(m: MapLibreMap, exaggeration: number) {
  const bounds = m.getBounds();
  if (!bounds) return;
  const source = terrainSourceForView(
    [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    m.getZoom(),
    siteTerrains,
  );
  const current = m.getTerrain();
  if (source === null) {
    if (current) m.setTerrain(null);
    return null;
  }
  // React refresh or initial source setup can run before all sources exist.
  if (!m.getSource(source)) return null;
  if (current?.source !== source || current.exaggeration !== exaggeration) {
    m.setTerrain({ source, exaggeration });
  }
  return source;
}

export function addTerrain(m: MapLibreMap, beforeId?: string) {
  m.addSource("mars-global", GLOBAL_COLOR_SOURCE);
  m.addLayer({ id: "mars-global", type: "raster", source: "mars-global" }, beforeId);
  m.addSource("global-dem", {
    type: "raster-dem",
    tiles: [mapAsset("global-dem/{z}/{x}/{y}.png")],
    encoding: "terrarium",
    tileSize: 256,
    minzoom: 0,
    maxzoom: 4,
    attribution: "NASA/MGS/MOLA; PDS Geosciences",
  });
  m.addSource(REGIONAL_TERRAIN_SOURCE, {
    type: "raster-dem",
    tiles: [mapAsset("legacy/display/mola/{z}/{x}/{y}.png")],
    encoding: "terrarium",
    tileSize: 256,
    minzoom: 5,
    maxzoom: 8,
    bounds: [-180, 40, -168, 52],
  });
  m.addSource(LOCAL_TERRAIN_SOURCE, {
    type: "raster-dem",
    tiles: [mapAsset("legacy/display/hab/{z}/{x}/{y}.png")],
    encoding: "terrarium",
    tileSize: 256,
    minzoom: 9,
    maxzoom: 11,
    bounds: [...LOCAL_TERRAIN_BOUNDS],
    attribution: "NASA/MOLA; ESA/DLR/FU Berlin/HRSC; USGS",
  });
  updateTerrain(m, MARS_TO_MAP);
}

/** A HiRISE water-ice site from sites.geojson (pipelines/stable/hirise-sites.ts). */
export interface SiteProps {
  id: string;
  hirise_id: string;
  title: string;
  confirmed: boolean;
  site_kind: "crater" | "ridges";
  kind: "poi" | "footprint";
  url: string;
  bbox: [number, number, number, number];
  terrain_bbox: [number, number, number, number];
  position_note?: string;
}

// Site tiles from M's R2 release once uploaded, else local (gitignored) output of pnpm pipe:sites.
const siteTiles = (id: string, layer: string, ext: string) => [
  SITE_DATA_ROOT
    ? `${SITE_DATA_ROOT}/sites/${id}/${layer}/{z}/{x}/{y}.${ext}`
    : `${location.origin}/data/sites/${id}/${layer}/{z}/{x}/{y}.${ext}`,
];

/** Per site: 1 m terrain (display-shifted like the other sources), 0.45 m imagery, slope classes. */
export function addSites(m: MapLibreMap, sites: SiteProps[], beforeId?: string) {
  siteTerrains = [];
  for (const site of sites) {
    const dem = `site-dem-${site.id}`;
    m.addSource(dem, {
      type: "raster-dem",
      tiles: siteTiles(site.id, "terrain", "png"),
      encoding: "terrarium",
      tileSize: 256,
      minzoom: 9,
      maxzoom: 15,
      bounds: site.terrain_bbox,
      attribution: SITE_ATTRIBUTION,
    });
    siteTerrains.push({ source: dem, bounds: site.terrain_bbox });
    m.addSource(`site-${site.id}`, {
      type: "raster",
      tiles: siteTiles(site.id, "imagery", "webp"),
      tileSize: 256,
      minzoom: 11,
      maxzoom: 17,
      bounds: site.bbox,
      attribution: SITE_ATTRIBUTION,
    });
    m.addLayer(
      { id: `site-${site.id}`, type: "raster", source: `site-${site.id}`, minzoom: 10 },
      beforeId,
    );
    // Slope classes (pipelines/stable/slope.ts): yellow 10–15°, orange 15°–limit, red ≥ limit (config.yaml slope_max_deg, 20°).
    m.addSource(`slope-${site.id}`, {
      type: "raster",
      tiles: siteTiles(site.id, "slope", "webp"),
      tileSize: 256,
      minzoom: 11,
      maxzoom: 16,
      bounds: site.bbox,
    });
    m.addLayer(
      {
        id: `slope-${site.id}`,
        type: "raster",
        source: `slope-${site.id}`,
        minzoom: 10,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.75 },
      },
      beforeId,
    );
    // Roughness classes (pipelines/stable/roughness.ts); smooth cells are transparent in the tiles.
    m.addSource(`roughness-${site.id}`, {
      type: "raster",
      tiles: roughnessTiles(location.origin, site.id),
      tileSize: 256,
      minzoom: 11,
      maxzoom: 16,
      bounds: site.bbox,
      attribution: ROUGHNESS_ATTRIBUTION,
    });
    m.addLayer(
      {
        id: `roughness-${site.id}`,
        type: "raster",
        source: `roughness-${site.id}`,
        minzoom: 10,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.8 },
      },
      beforeId,
    );
  }
}

export function setRoughnessVisible(m: MapLibreMap, sites: { id: string }[], on: boolean) {
  for (const s of sites) {
    const id = `roughness-${s.id}`;
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

const thermalInertiaLayers = THERMAL_INERTIA_BOUNDS.map((_, i) => `thermal-inertia-${i}`);

/** THEMIS thermal inertia, z5–11; no-data pixels are transparent in the tiles. Two sources split at ±180. */
export function addThermalInertia(m: MapLibreMap, beforeId?: string) {
  THERMAL_INERTIA_BOUNDS.forEach((bounds, i) => {
    const id = thermalInertiaLayers[i];
    m.addSource(id, {
      type: "raster",
      tiles: thermalInertiaTiles(location.origin),
      tileSize: 256,
      minzoom: 5,
      maxzoom: 11,
      bounds,
      attribution: THERMAL_INERTIA_ATTRIBUTION,
    });
    m.addLayer(
      {
        id,
        type: "raster",
        source: id,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.7 },
      },
      beforeId,
    );
  });
}

export function setThermalInertiaVisible(m: MapLibreMap, on: boolean) {
  for (const id of thermalInertiaLayers) {
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

const regionalSlopeLayers = REGIONAL_SLOPE_BOUNDS.map((_, i) => `regional-slope-${i}`);

/** MOLA/HRSC 200 m slope for the drive corridor, z5–10; below 10° is transparent. Two sources split at ±180. */
export function addRegionalSlope(m: MapLibreMap, beforeId?: string) {
  REGIONAL_SLOPE_BOUNDS.forEach((bounds, i) => {
    const id = regionalSlopeLayers[i];
    m.addSource(id, {
      type: "raster",
      tiles: regionalSlopeTiles(location.origin),
      tileSize: 256,
      minzoom: 5,
      maxzoom: 10,
      bounds,
      attribution: REGIONAL_SLOPE_ATTRIBUTION,
    });
    m.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" } }, beforeId);
  });
}

export function setRegionalSlopeVisible(m: MapLibreMap, on: boolean) {
  for (const id of regionalSlopeLayers) {
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

const geologyLayers = ["geology", "geology-line"];

/** USGS SIM 3292 units (1:20M), translucent fill + contacts; regional context only. */
export function addGeology(m: MapLibreMap, beforeId?: string) {
  m.addSource("geology", {
    type: "geojson",
    data: geologyUrl(location.origin),
    attribution: GEOLOGY_ATTRIBUTION,
  });
  const fill = [
    "match",
    ["get", "unit"],
    ...GEOLOGY_LEGEND.flatMap((c) => [c.unit, c.color ?? "transparent"]),
    "rgb(128 128 128)",
  ] as unknown as string;
  m.addLayer(
    {
      id: "geology",
      type: "fill",
      source: "geology",
      layout: { visibility: "none" },
      paint: { "fill-color": fill, "fill-opacity": 0.35 },
    },
    beforeId,
  );
  m.addLayer(
    {
      id: "geology-line",
      type: "line",
      source: "geology",
      layout: { visibility: "none" },
      paint: { "line-color": "rgb(40 20 15)", "line-width": 1, "line-opacity": 0.6 },
    },
    beforeId,
  );
}

export function setGeologyVisible(m: MapLibreMap, on: boolean) {
  for (const id of geologyLayers) {
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

export function setSlopeVisible(m: MapLibreMap, sites: { id: string }[], on: boolean) {
  for (const s of sites) {
    const id = `slope-${s.id}`;
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

/** A visual atmosphere, independent of the NASA dust measurements and model fields. */
export function setMarsSky(m: MapLibreMap) {
  m.setSky({
    "sky-color": MARS_SKY_COLOR,
    "horizon-color": MARS_HORIZON_COLOR,
    "fog-color": MARS_HORIZON_COLOR,
    "sky-horizon-blend": 0.5,
    "horizon-fog-blend": 0.2,
    "fog-ground-blend": 0.1,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 0],
  });
  // Leave orbital space transparent for the illustrative starfield; fade to opaque surface sky.
  const canvas = m.getCanvas();
  const updateBackground = () => {
    canvas.style.backgroundColor = `rgba(176,132,104,${skyBlend(m.getZoom())})`;
  };
  updateBackground();
  m.on("zoom", updateBackground);
  m.once("remove", () => m.off("zoom", updateBackground));
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

/** three.js custom layer placing the habitat on the terrain at `at`. */
export function habitatLayer(
  maplibregl: MapLibreGL,
  at: LngLat,
  onEnlargedChange?: (enlarged: boolean) => void,
): CustomLayerInterface {
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffeee0, 0x785849, 1.8));
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.8);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  let renderer: THREE.WebGLRenderer;
  let map: MapLibreMap;
  let removed = false;
  let bounds: THREE.Box3 | undefined;
  let enlarged = false;

  return {
    id: "habitat",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      new GLTFLoader().load(
        "/models/mars/hab.glb",
        (gltf) => {
          if (removed) {
            disposeModel(gltf.scene);
            return;
          }
          // The authored asset is already ground-centered, Y-up and measured in metres.
          scene.add(gltf.scene);
          bounds = new THREE.Box3().setFromObject(gltf.scene);
          map.triggerRepaint();
        },
        undefined,
        () => {
          if (!removed)
            map.fire("error", {
              error: new Error("Habitat model could not load. Reload the map to retry."),
            });
        },
      );
    },
    render(_gl, { defaultProjectionData }) {
      if (map.getZoom() < 7 || !map.getTerrain() || !bounds) return;
      const elevation = map.queryTerrainElevation(at) ?? 0;
      const origin = maplibregl.MercatorCoordinate.fromLngLat(at, elevation);
      const scale = origin.meterInMercatorCoordinateUnits() * MARS_TO_MAP;
      const model = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z ?? 0)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      const flat = new THREE.Matrix4()
        .fromArray(defaultProjectionData.fallbackMatrix)
        .multiply(model);
      const globe = new THREE.Matrix4()
        .fromArray(defaultProjectionData.mainMatrix)
        .multiply(habitatGlobeMatrix(at[0], at[1], elevation));
      camera.projectionMatrix = habitatProjection(
        flat,
        globe,
        defaultProjectionData.projectionTransition,
      );
      const canvas = map.getCanvas();
      const displayScale = habitatDisplayScale(
        camera.projectionMatrix,
        bounds,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const nextEnlarged = displayScale > 1.001;
      if (nextEnlarged !== enlarged) {
        enlarged = nextEnlarged;
        onEnlargedChange?.(enlarged);
      }
      camera.projectionMatrix.scale(new THREE.Vector3(displayScale, displayScale, displayScale));
      renderer.resetState();
      // A display-sized symbol must not disappear beneath terrain outside its true footprint.
      if (enlarged) renderer.clearDepth();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
    onRemove() {
      removed = true;
      disposeModel(scene);
      renderer.dispose();
    },
  };
}
