# Homebase dashboard

Click the homebase marker or the **Mission dashboard** button on `/` to open the console over the existing map. Full map or Escape closes it without recreating the map or changing its simulation. `/mission` opens the overview directly, and `/mission/experiments` opens the experiment log. Inside the map dialog, both pages share the same fetched response and preserve the map underneath. There is no entry screen, mission creation, replay control, fault injection or simulation state in this dashboard.

## Data connection

`GET /api/telemetry/homebase` is public, read-only and requires no mission capability or write key. It:

1. Requires the configured published `TELEMETRY_RELEASE`.
2. Selects a day only from acquired calibrated ATS and derived PS/RHS products with samples. The current bounded release has exactly one eligible day: Perseverance sol 816, 6 June 2023. This archived day is explicitly called demo today, not real-time weather.
3. Reads bounded, already-masked 60-second rollups for air temperature (K), pressure (Pa) and water-vapor mixing ratio (ppm). Percent relative humidity is not inferred.
4. Chooses the latest common valid environmental bucket for the readouts. Approximate UTC comes from the retained ATS sample's label-derived clock anchor, not a new measurement. Charts show the available window, not an invented full day. Nulls and absent buckets stay gaps.
5. Adds Curiosity RAD detector E absorbed dose rate converted from µGy/day to µGy/h. Quality flags remain null; unavailable radiation never fails the weather dashboard. The source remains Gale crater, not Jezero, the homebase or crew exposure.
6. Returns all 23 MOXIE whole-run summaries, their source URLs and quality notes. Zero output differs from missing derived output. Experiment energy includes warmup and diagnostics.

Weather is a **Jezero reference** and radiation a **Gale proxy**. The map's existing hypothetical homebase is in Arcadia. No readings are relocated to it. The header, metric source labels and source details retain that distinction. Observed wind/dust and forecasts are not acquired. The separate map dust playback is a NASA Ames reference simulation, not these archived measurements.

The local configuration must select an imported, published release. The supplied `nasa-v1` override was not published in the local database; `.dev.vars` now selects `nasa-demo-50k-v1`, matching `wrangler.jsonc`. Local credential values remain ignored and are never sent to dashboard clients. No database migration, new acquisition, mission session or D1 write is needed for this view.

## UI and motion

`components/homebase/` owns the dashboard, metric cards, observation plot, experiment log and map entry. Coss registry components are unmodified. The existing map, terrain and simulation controls remain their owners' work.

The original console's proportions are restored: a three-column upper workspace with numbered, tinted title rails; a lower telemetry strip; and a two-line status region. Left: fixed archive clock, acquired window and source sites. Center: archived CTX image context for the hypothetical Arcadia base. Right: that day's archived MOXIE output, peak/active mean rate, active time and whole-run energy. The lower strip shows temperature, pressure, water vapor and radiation proxy readouts and charts simultaneously. There are no simulated resource gauges or fault controls.

The surface pane uses an independent MapLibre camera and the same immutable CTX
XYZ imagery from the map's published R2 release. Pan and zoom stay within the
acquired Arcadia bounds. The minimum zoom adapts to the pane dimensions so the
view cannot reveal space beyond the footprint. Rotation and tilt are disabled;
zoom buttons, keyboard navigation and Reset view are available. Pointer movement
updates a labeled Cursor coordinate readout; leaving the map restores Map base.
`lib/homebase/context.ts` owns the bounds and viewport calculation without
Earth-distance calculations. Attribution and the existing provenance manifest
remain linked. Images do not become terrain statistics or base weather. Outside
the acquired Arcadia bounds, or on image failure, show an unavailable message
instead of relocating imagery. The main map camera, mission sidebar, verdict
strip, routing, dust, sites and LARA remain independent. The dashboard shortcut
sits above the map's lower-left attribution, clear of the top verdict strip and
lower-right LARA launcher.

Overview and Experiments are separate pages, with 1/2 shortcuts outside form controls. The experiments page lists all 23 runs through explicit pagination rather than a scrollbar. Available height determines the number of complete rows; resize and 200% zoom recompute the page size. Selecting a run shows derived output, rate, duration, energy and source notes. A short-screen results/notes switch and a handheld list/detail switch avoid clipping. Observation Zoom opens a full-screen inspector with chart zoom and separately paginated values/source views. Escape closes the inspector before closing the map dialog.

The console itself does not scroll. On narrow or zoomed displays, all four readings remain visible and select one chart; Reference details provides clock, surface, oxygen and source panes without shrinking labels. Persistent archive/date, historical-mode and connection labels remain visible. Normal/error/loading layouts use the same fixed viewport shell, not a fixed footer covering data.

Observation charts use unsmoothed line segments and preserve gaps. Repeated
sample markers are omitted; isolated observations and the inspected sample use
fixed-size circular markers outside the stretched SVG coordinate system.
Expanded charts have five aligned value ticks and compact charts have three.

Loading happens in place with fixed-size pane frames. Every numeric readout is one text node containing the actual fetched value; a short transform-only settle replaces the former clipped glyph reels and their stray top bars. A single SVG mask reveals the entire chart signal smoothly, including all disconnected segments, rather than animating each path or sweeping a bar over the data. Reloads retain the current readings and frames until the next response. Reduced-motion mode renders final text and signals immediately with a static loaded border. There is no flashing, fake boot log, startup gate, substitute digit sequence or continuously changing weather.

Desktop viewing distance is assumed to be 600 mm and handheld 400 mm. Labels are at least 16 px, text uses high-contrast theme pairs, and narrow/zoomed displays use selection and pagination instead of scrolling or smaller type. This is not formal operational-safety certification.

## Verification

Run the repository checks from `AGENTS.md`. The HTTP suite checks the read-only endpoint, four real metrics, matching sol, provenance and 23-run log. Browser checks cover direct page access without a gate, map entry/return, no dashboard mission commands, all four real plots, inspection/zoom, complete experiment pagination, filtering, missing output, sources, animations, reduced motion, failed connections and no-scroll layouts. Unit tests also round-trip tile placement and preserve readable source-warning boundaries.

Earlier simulation helpers and APIs remain available for map integration, but the homebase dashboard neither imports their session hook nor invokes their command endpoints.
