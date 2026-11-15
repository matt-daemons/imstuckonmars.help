// 3D scene helpers for the Mapbox map: MOLA terrain, the habitat model, and the dust-storm effect.
import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import * as THREE from "three";

import type { LngLat } from "@/lib/mars/types";

type MapboxGL = typeof import("mapbox-gl").default;

/**
 * Mapbox sizes the world with Earth's radius, so Mars coordinates render 1.878× too large.
 * Terrain exaggeration of MARS_TO_MAP is true Mars scale; 3D models scale by the same factor.
 */
export const MARS_TO_MAP = 6378137 / 3396190;

const TERRAIN_TILES = "/data/terrain/mola";
export const TERRAIN_SOURCE = "MGS MOLA 463 m DEM (USGS Astrogeology)";

export function addTerrain(m: MapboxMap, beforeId?: string) {
  const origin = location.origin; // Mapbox needs absolute tile URLs
  m.addSource("mola-dem", {
    type: "raster-dem",
    tiles: [`${origin}${TERRAIN_TILES}/terrain/{z}/{x}/{y}.png`],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 8,
  });
  m.addSource("mola-base", {
    type: "raster",
    tiles: [`${origin}${TERRAIN_TILES}/base/{z}/{x}/{y}.png`],
    tileSize: 256,
    maxzoom: 8,
  });
  m.addLayer({ id: "mola-base", type: "raster", source: "mola-base" }, beforeId);
  m.setTerrain({ source: "mola-dem", exaggeration: MARS_TO_MAP });
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
    "space-color": mix(CLEAR.sky, STORM.sky, t),
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
