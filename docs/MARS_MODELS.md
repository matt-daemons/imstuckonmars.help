# Mars models

Three original, movie-inspired conceptual assets. These are not extracted film props, NASA models, or engineering designs. Dimensions and visible equipment are illustrative. The project MIT license applies.

| Asset             | GLB                                              | Front preview                                    | Rear preview                                               |
| ----------------- | ------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| HAB               | [/models/mars/hab.glb](/models/mars/hab.glb)     | [/models/mars/hab.png](/models/mars/hab.png)     | [/models/mars/hab-rear.png](/models/mars/hab-rear.png)     |
| Pressurized rover | [/models/mars/rover.glb](/models/mars/rover.glb) | [/models/mars/rover.png](/models/mars/rover.png) | [/models/mars/rover-rear.png](/models/mars/rover-rear.png) |
| MAV               | [/models/mars/mav.glb](/models/mars/mav.glb)     | [/models/mars/mav.png](/models/mars/mav.png)     | [/models/mars/mav-rear.png](/models/mars/mav-rear.png)     |

The HAB has a ribbed pressure shell, forward airlock and platform, paired solar wings, observation ports, service panels, and roof communications equipment. The rover has six treaded wheels, exposed suspension, a glazed pressure cabin, rear access hatch, utility tanks, cargo, and a roof array. The MAV has an ascent stage, four external tanks, four landing legs, engine bells, a ladder, and an access platform. MAV means Mars Ascent Vehicle, not the ground rover.

## Placement contract

- glTF 2.0 binary, self-contained geometry and metallic-roughness materials. No external textures, extensions, network requests, animations, or runtime dependencies.
- Right-handed, meters, +Y up, +Z forward. Rover windshield and HAB airlock face +Z. Rotate at the renderer boundary if its coordinate convention differs.
- Ground-level origin at the main structure's footprint center. Bounds include solar wings, antennae, and access equipment. Read exact bounds, dimensions, triangle counts, byte sizes, and checksums from `public/models/mars/manifest.json`.
- One mesh per asset, grouped into primitives by material. Component names and triangle counts are recorded in the manifest; individual doors, wheels, and legs are not separate animated nodes.
- For multiple MAVs or rovers, load once and instance the asset. Model placement must follow the existing mission-state owner. These files contain no planetary coordinates or simulated resource capacities.
- Preserve true dimensions in scene units. If a map renderer uses Earth-based Mercator meters for Mars geometry, the map owner must apply its documented conversion once, not bake it into these meshes.

These are exterior map-scale assets, not walkable interiors. No occupant count, fuel capacity, thrust, pressure rating, or life-support capability is implied by the geometry.

## Regenerate and check

Node.js 24 is sufficient. No Blender, third-party 3D package, or API key is needed.

```sh
node scripts/models/build.mjs
node --test scripts/models/models.test.mjs
```

Edit `scripts/models/vehicles.mjs` for the vehicle shapes and equipment. `geometry.mjs` owns primitive construction, GLB serialization, and the small deterministic PNG preview renderer. Regeneration also updates the manifest. Commit generated GLBs, previews, and manifest together with their source.

The previews render the source triangles with back-face culling and a depth buffer. They establish shape and winding, not pixel parity with a browser's physically based materials. Check the GLBs in the target renderer before integrating them into the map.

## Packaging

All delivered assets live in `public/models/mars/`. The existing Vite build copies `public/` to `dist/client/`, and the Nix fileset already includes `public/`. The offline generator is not required at runtime. No map or dashboard implementation is changed.
