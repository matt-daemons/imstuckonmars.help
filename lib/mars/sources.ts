/**
 * Every layer and data feed LARA shows, with its credit and caveats, for the /sources screen.
 * Keep in sync with public/data/processed/manifest.json (sources.test.ts checks the ids) and with
 * CLAUDE.md §10 References. Caveats are copied from each layer's provenance file or pipeline notes.
 */

/** What kind of evidence an entry is. Drives the badge on the sources screen. */
export type EvidenceKind =
  | "observation" // NASA measurement or imagery, as archived
  | "derived" // computed by LARA from NASA data
  | "model" // NASA model output, not observed
  | "simulated" // LARA simulation from stated assumptions
  | "illustration" // display only, not data
  | "ai" // AI-generated
  | "placeholder"; // stand-in until real data lands

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  observation: "NASA observation",
  derived: "Derived by LARA",
  model: "Model output",
  simulated: "Simulated",
  illustration: "Illustration",
  ai: "AI-generated",
  placeholder: "Placeholder",
};

export interface SourceLink {
  label: string;
  url: string;
}

export interface SourceEntry {
  id: string;
  title: string;
  kind: EvidenceKind;
  /** Credit line as shown on the map. */
  credit: string;
  /** Resolution, coverage or product IDs. */
  detail?: string;
  /** Where it appears in LARA and what it is used for. */
  use: string;
  caveats: string[];
  citations?: string[];
  links?: SourceLink[];
  /** Manifest layer ids this entry covers (checked by sources.test.ts). */
  layerIds?: string[];
}

export interface SourceGroup {
  id: string;
  title: string;
  intro: string;
  entries: SourceEntry[];
}

const HIRISE_DTMS = [
  "DTEEC_033225_2250_033146_2250_A01",
  "DTEEC_034082_2260_033014_2260_A01",
  "DTEEC_037352_2245_037418_2245_A01",
  "DTEEC_054060_2265_054126_2265_A01",
];

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: "map",
    title: "Map layers",
    intro: "Imagery, terrain and overlays on the map. Credits also appear in the map's corner.",
    entries: [
      {
        id: "viking-color",
        title: "Global colour basemap",
        kind: "observation",
        credit: "NASA/Viking; USGS; NASA Ames",
        detail: "Colorized Viking MDIM 2.1 mosaic, 92,160 × 46,080 px",
        use: "Planet view and regional context.",
        caveats: [
          "Colours are a composite visualization, not calibrated true colour.",
          "Grid spacing is not positional accuracy.",
          "No AI upscaling or generated detail.",
        ],
      },
      {
        id: "terrain-mola",
        title: "Global and regional terrain",
        kind: "observation",
        credit: "NASA/MGS/MOLA; PDS Geosciences",
        detail: "MOLA elevation, about 3.7 km (global) and 463 m (regional) grids",
        use: "3D relief when zoomed out.",
        caveats: [
          "Regional context only. It does not show local hazards.",
          "Display heights are shifted up 10 km because the renderer can't draw below zero. True heights come from the DTMs.",
          "The renderer assumes Earth's radius, so LARA scales terrain by 1/1.878 to show true Mars proportions.",
        ],
        citations: [
          "Smith, D. E. et al. (2001). Mars Orbiter Laser Altimeter: experiment summary after the first year of global mapping of Mars. JGR 106(E10), 23689–23722.",
        ],
      },
      {
        id: "terrain-hab",
        title: "Habitat terrain, 200 m",
        kind: "observation",
        credit: "NASA/MOLA; ESA/DLR/FU Berlin/HRSC; USGS",
        detail: "MOLA/HRSC blended DEM, 200 m",
        use: "3D relief around the habitat.",
        caveats: [
          "The imagery shows more detail than this elevation grid.",
          "200 m cells can't show boulders, small craters or short steep slopes.",
          "Display heights are shifted up 10 km, as above.",
        ],
      },
      {
        id: "mola-base",
        title: "Elevation-coloured hillshade",
        kind: "illustration",
        credit: "NASA/MGS/MOLA",
        use: "Optional relief shading. Off by default.",
        caveats: ["Colours encode height. They are not surface colour."],
        layerIds: ["mola-base"],
      },
      {
        id: "ctx-context",
        title: "Orbital imagery around the habitat",
        kind: "observation",
        credit: "NASA/JPL/MSSS/The Murray Lab; served by Esri",
        detail: "MRO Context Camera (CTX) global mosaic, about 5 m/px",
        use: "Surface detail around the habitat.",
        caveats: [
          "Greyscale, JPEG-compressed imagery. It is not elevation.",
          "Registration errors may approach 200 m, so it can't certify hazards.",
          "The service labels itself beta01 while the catalog says V01.",
        ],
        citations: [
          "Dickson, J. L., Ehlmann, B. L., Kerber, L. & Fassett, C. I. (2024). The Global Context Camera (CTX) Mosaic of Mars: A Product of Information-Preserving Image Data Processing. Earth and Space Science 11(7), e2024EA003555. doi:10.1029/2024EA003555",
        ],
        links: [
          {
            label: "CTX mosaic service",
            url: "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer",
          },
        ],
        layerIds: ["ctx-context"],
      },
      {
        id: "ai-visual-preview",
        title: "AI texture experiment",
        kind: "ai",
        credit: "Generated with openai/gpt-image-2 from one CTX tile",
        detail: "2× visual upscale of a single CTX tile near the habitat",
        use: "Optional visual comparison only. Off by default.",
        caveats: [
          "Generated pixels are not measurements.",
          "Never used for elevation, slope, hazard detection, routing or resource calculations.",
        ],
        links: [
          {
            label: "Provenance and prompt",
            url: "https://tiles.imstuckonmars.help/mars-v2/legacy/ctx/ai-provenance.json",
          },
        ],
        layerIds: ["ai-visual-preview"],
      },
      {
        id: "sites",
        title: "Water-ice sites (HiRISE)",
        kind: "observation",
        credit: "NASA/JPL/University of Arizona",
        detail: `0.25 m RED orthoimages shown at about 0.45 m; 1 m DTMs. ${HIRISE_DTMS.join(", ")}`,
        use: "Four candidate ice sites: terraced craters and ridges in Arcadia Planitia.",
        caveats: [
          "Each site marker is a crater-bowl centre refined on the 1 m DTM (about ±50 m). One crater was suggested with AI assistance and confirmed by a team member. The ridges site uses the DTM centre.",
          "Terraced craters are indirect evidence of buried ice. No lander has confirmed ice at these sites.",
          "HiRISE RED is greyscale. DTM edges are unreliable, so the outer 10 m are trimmed.",
          "The sites are 93–468 km from the habitat, so the crew drives there by rover.",
        ],
        citations: [
          "McEwen, A. S. et al. (2007). Mars Reconnaissance Orbiter's High Resolution Imaging Science Experiment (HiRISE). JGR 112, E05S02.",
          "Kirk, R. L. et al. (2008). Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images. JGR 113, E00A24.",
          "Bramson, A. M. et al. (2015). Widespread excess ice in Arcadia Planitia, Mars. GRL 42, 6566–6574.",
        ],
        links: [{ label: "HiRISE DTM catalog", url: "https://www.uahirise.org/dtm/" }],
        layerIds: ["sites"],
      },
      {
        id: "slope",
        title: "Slope hazard classes",
        kind: "derived",
        credit: "Derived from NASA/JPL/University of Arizona HiRISE DTMs",
        detail:
          "Yellow 10–15°, orange 15–20°, red ≥ 20°. Share of each site ≥ 20°: 0.1 %, 1.8 %, 0.2 %, 0.7 %",
        use: "Slope hazard switch in the Scene panel.",
        caveats: [
          "The 20° limit is NASA's lunar suit value. NASA has no Mars limit, so it is an assumption.",
          "A 1 m DTM misses rocks smaller than a metre. Those show only in the imagery.",
          "A few isolated one-pixel spikes remain, so LARA reports percentages, not the maximum.",
          "Computed on a local metre grid, which avoids the ~30 % stretch a lon/lat grid has at 45°N.",
        ],
      },
      {
        id: "dust",
        title: "Dust storm playback",
        kind: "model",
        credit: "NASA Ames Mars Global Climate Model",
        detail: "2018 global dust storm reference simulation, 2° grid, every 2 sols",
        use: "Dust storm playback in the Scene panel.",
        caveats: [
          "Model output. It is not observed weather and not a forecast.",
          "A 2° grid can't resolve local storms or weather at the habitat.",
          "Optical depth is normalized to 610 Pa. It is not dust mass.",
          "No wind vectors or trajectories in this subset.",
          "Sampling every two sols can miss shorter events.",
        ],
        citations: [
          "Bertrand, T. et al. (2020). Simulation of the 2018 global dust storm on Mars using the NASA Ames Mars GCM: a multitracer approach. JGR Planets 125(7), e2019JE006122. doi:10.1029/2019JE006122",
        ],
        links: [
          { label: "DOI", url: "https://doi.org/10.1029/2019JE006122" },
          { label: "NASA Ames data", url: "https://data.nas.nasa.gov/legacygcm/" },
        ],
      },
      {
        id: "plan",
        title: "Science stops and planned route",
        kind: "placeholder",
        credit: "LARA routing team",
        use: "Route and stops on the map.",
        caveats: [
          "Placeholder geometry until the routing team's routes land. It is not a planned traverse.",
        ],
        layerIds: ["stops", "route"],
      },
      {
        id: "habitat",
        title: "Habitat and vehicles",
        kind: "illustration",
        credit: "LARA team 3D models",
        detail: "Hypothetical base at 45.97°N, 183.95°E",
        use: "Shows where the crew lives and parks.",
        caveats: ["The base location and models are illustrations, not a NASA design."],
      },
    ],
  },
  {
    id: "mission",
    title: "Mission data",
    intro:
      "Readings in the LARA panel. No instrument has operated in Arcadia Planitia, so weather and radiation come from other rover sites and are replayed as if live.",
    entries: [
      {
        id: "meda",
        title: "Weather · Perseverance MEDA",
        kind: "observation",
        credit: "NASA Mars 2020 MEDA · PDS Atmospheres Node",
        detail: "Calibrated and derived products, sol 816, Jezero crater",
        use: "Air temperature, pressure and other weather readings.",
        caveats: [
          "Proxy data. Jezero is about 5,200 km from the habitat.",
          "Historical readings replayed as live. It is not current weather.",
          "Derived products contain artifacts and metadata conflicts. Masked values are withheld.",
          "No observed wind or dust: the wind sensor has no product after damage on sol 313.",
        ],
      },
      {
        id: "rad",
        title: "Radiation · Curiosity RAD",
        kind: "observation",
        credit: "NASA MSL RAD · NASA SPDF",
        detail: "Level 2 dose-rate observations, Gale crater",
        use: "Dose rate readout and the radiation flight rule.",
        caveats: [
          "Proxy data. Gale crater is about 3,900 km from the habitat.",
          "Absorbed dose rate in the detector material. It is not dose equivalent or crew exposure.",
          "Historical observations aligned by UTC. It is not live space weather.",
          "Flagged observations are withheld, not shown as zero.",
        ],
        citations: [
          "Hassler, D. M. et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. Science 343(6169), 1244797. doi:10.1126/science.1244797",
          "Guo, J. et al. (2015). Modeling the variations of dose rate measured by RAD during the first MSL Martian year: 2012–2014. ApJ 810(1), 24. doi:10.1088/0004-637X/810/1/24",
        ],
        links: [
          {
            label: "RAD data at NASA SPDF",
            url: "https://spdf.gsfc.nasa.gov/pub/data/aaa_planetary/msl/rad/cdf/obs-l2/",
          },
        ],
      },
      {
        id: "moxie",
        title: "Oxygen production · Perseverance MOXIE",
        kind: "observation",
        credit: "NASA Mars 2020 MOXIE · PDS Atmospheres Node",
        detail: "23 calibrated and 22 derived runs, one-second engineering samples",
        use: "Shows what in-situ oxygen production looked like on Mars.",
        caveats: [
          "Archived engineering readings. They are not the crew's oxygen supply.",
          "The oxygen rate is derived from current, not measured flow.",
          "Sol 901's elapsed-time counter resets partway through.",
        ],
        links: [
          {
            label: "MOXIE bundle",
            url: "https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/moxie_bundle/bundle_moxie.xml",
          },
        ],
      },
      {
        id: "resources",
        title: "Suit and base oxygen and battery",
        kind: "simulated",
        credit: "LARA simulation",
        use: "Resource readouts, reserves and forecasts in the LARA panel.",
        caveats: [
          "Simulated from stated assumptions. No real suit or habitat telemetry.",
          "Reserves come from the flight rules below.",
        ],
      },
      {
        id: "clock",
        title: "Mars clock",
        kind: "derived",
        credit: "Mars24 algorithm",
        use: "Sol number and local solar time at the habitat.",
        caveats: ["Computed from the date, not observed."],
        citations: [
          "Allison, M. & McEwen, M. (2000). A post-Pathfinder evaluation of areocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies. Planetary and Space Science 48(2–3), 215–235. doi:10.1016/S0032-0633(99)00092-6",
        ],
      },
      {
        id: "themis",
        title: "Thermal inertia (not on the map yet)",
        kind: "derived",
        credit: "NASA/JPL-Caltech/Arizona State University/USGS",
        detail: "THEMIS Thermal Inertia Mosaic, Quantitative, 100 m/px",
        use: "Loose dust and sand versus firm or rocky ground at each site.",
        caveats: [
          "THEMIS covers about 57 % of the area. Gaps are unknown, not safe.",
          "About 20 % accurate, and describes only the top few centimetres.",
          "100 m pixels average rocks, sand and dust. Classes are indicative only.",
          "Not ground-truthed: no rover has operated in Arcadia Planitia.",
        ],
        citations: [
          "Fergason, R. L., Christensen, P. R. & Kieffer, H. H. (2006). High-resolution thermal inertia derived from THEMIS: thermal model and applications. JGR 111, E12004.",
        ],
        links: [
          {
            label: "USGS Astrogeology",
            url: "https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30n180e_100mpp",
          },
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "AI in LARA",
    intro: "Where AI is used, and where it is not allowed to decide.",
    entries: [
      {
        id: "copilot",
        title: "LARA voice copilot",
        kind: "ai",
        credit: "Language model via OpenRouter · voice by ElevenLabs · wake word by Vosk",
        use: "Answers crew questions about the mission state.",
        caveats: [
          "LARA's voice is AI-generated speech (ElevenLabs).",
          "Explains results from LARA's tools. It does not decide.",
          "GO, CAUTION and NO-GO come from fixed flight-rule thresholds, never from the model.",
        ],
      },
      {
        id: "dev",
        title: "AI coding agents",
        kind: "ai",
        credit: "Anthropic Claude via Claude Code",
        use: "Helped write and review code, data pipelines and documentation.",
        caveats: [
          "The team chose the concept, location, science objective and flight-rule values.",
          "Commits made with AI assistance carry a Co-Authored-By trailer where recorded.",
        ],
      },
    ],
  },
];
