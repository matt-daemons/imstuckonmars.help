// 3D scene helpers for the Mapbox map: MOLA terrain, the habitat model, and the dust-storm effect.
import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import * as THREE from "three";

import type { LngLat } from "@/lib/mars/types";
import { GLOBAL_COLOR_SOURCE, mapAsset } from "@/lib/mars/map-data";
import { SITE_TILESETS } from "@/lib/mars/site-tilesets";
import {
  LOCAL_TERRAIN_BOUNDS,
  LOCAL_TERRAIN_SOURCE,
  MARS_TO_MAP,
  REGIONAL_TERRAIN_SOURCE,
  type SiteTerrain,
  terrainSourceForView,
} from "@/lib/mars/terrain";

type MapboxGL = typeof import("mapbox-gl").default;

/**
 * Mapbox sizes the world with Earth's radius, so Mars coordinates render 1.878× too large.
 * Terrain exaggeration of MARS_TO_MAP is true Mars scale; 3D models scale by the same factor.
 */
export { MARS_TO_MAP } from "@/lib/mars/terrain";

export const TERRAIN_SOURCE =
  "MOLA global and regional grids, and a MOLA/HRSC 200 m grid near the habitat";

// HiRISE site terrain sources registered by addSites, consulted by updateTerrain.
let siteTerrains: SiteTerrain[] = [];
export const SITE_ATTRIBUTION = "NASA/JPL/University of Arizona";

export function updateTerrain(m: MapboxMap, exaggeration: number) {
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

export function addTerrain(m: MapboxMap, beforeId?: string) {
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

// Site tiles are generated locally (gitignored) until they are hosted; see CLAUDE.md Step 2f.
const siteTiles = (id: string, layer: string, ext: string) => [
  `${location.origin}/data/sites/${id}/${layer}/{z}/{x}/{y}.${ext}`,
];

/** Per site: 1 m terrain (display-shifted like the other sources), 0.45 m imagery, slope classes. */
export function addSites(m: MapboxMap, sites: SiteProps[], beforeId?: string) {
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
    const tileset = SITE_TILESETS[site.id];
    m.addSource(`site-${site.id}`, {
      type: "raster",
      // Mapbox-hosted imagery once M uploads it; local tiles until then.
      ...(tileset
        ? { url: `mapbox://${tileset}` }
        : { tiles: siteTiles(site.id, "imagery", "webp") }),
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
  }
}

export function setSlopeVisible(m: MapboxMap, sites: { id: string }[], on: boolean) {
  for (const s of sites) {
    const id = `slope-${s.id}`;
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

const CLEAR = { sky: [176, 132, 104], horizon: [214, 172, 132] };
const STORM = { sky: [150, 92, 52], horizon: [168, 104, 58] };

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/**
 * Illustrative dust storm: butterscotch fog that thickens with intensity (0–1), plus Mapbox's
 * snow particles tinted as dust and blown from `windFromDeg`. Not a physical dust model.
 */
export function setDustStorm(m: MapboxMap, intensity: number, windFromDeg: number) {
  const t = intensity;
  m.setFog({
    color: mix(CLEAR.horizon, STORM.horizon, t),
    "high-color": mix(CLEAR.sky, STORM.sky, t),
    "space-color": [
      "interpolate",
      ["linear"],
      ["zoom"],
      4,
      "#010405",
      7,
      mix(CLEAR.sky, STORM.sky, t),
    ],
    "horizon-blend": 0.1 + 0.3 * t,
    range: [2 - 1.5 * t, 12 - 10 * t],
    "star-intensity": 0,
  });
  m.setSnow(
    t > 0.01
      ? {
          density: 0.3 + 0.7 * t,
          intensity: 0.4 + 0.6 * t,
          color: "#c9925e",
          opacity: 0.4 + 0.5 * t,
          vignette: 0.6 * t,
          "vignette-color": "#8a4f24",
          "flake-size": 0.6,
          direction: [windFromDeg + 180, 80],
        }
      : null,
  );
}

/** Placeholder habitat built from primitives: hab module, airlock, solar arrays. Units are Mars metres. */
function buildHabitat(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e4de, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.8 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1e2a4a, roughness: 0.3, metalness: 0.5 });

  const hab = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 32), white);
  hab.position.y = 2;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    white,
  );
  dome.position.y = 4;
  const airlock = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 16), grey);
  airlock.rotation.z = Math.PI / 2;
  airlock.position.set(6.5, 1.5, 0);
  g.add(hab, dome, airlock);

  for (const z of [-14, 14]) {
    for (const x of [-6, 6]) {
      const array = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 4), panel);
      array.position.set(x, 1.6, z);
      array.rotation.x = -0.35;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), grey);
      post.position.set(x, 0.8, z);
      g.add(array, post);
    }
  }
  return g;
}

/** three.js custom layer placing the habitat on the terrain at `at`. */
export function habitatLayer(mapboxgl: MapboxGL, at: LngLat): CustomLayerInterface {
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(buildHabitat());
  scene.add(new THREE.AmbientLight(0xffe6cc, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  let renderer: THREE.WebGLRenderer;
  let map: MapboxMap;

  return {
    id: "habitat",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(_gl, matrix) {
      // The model uses a local Mercator matrix, after globe's close-up transition.
      if (map.getZoom() < 7 || !map.getTerrain()) return;
      const elevation = map.queryTerrainElevation(at) ?? 0;
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(at, elevation);
      const scale = origin.meterInMercatorCoordinateUnits() * MARS_TO_MAP;
      const model = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z ?? 0)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(model);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}
