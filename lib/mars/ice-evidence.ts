/**
 * Why each water-ice site is a candidate, and how strong that evidence is. Shown where the crew
 * picks a destination (step 02). No ice layer is on the map: the SWIM ice maps are offline, so
 * this is the published evidence, stated per site. Keyed by HiRISE observation ID; the test checks
 * every site in sites.geojson has an entry that matches its `site_kind` and `confirmed` values.
 */

export type IceEvidenceLevel = "terraced" | "possible-terraced" | "regional";

export interface IceEvidence {
  level: IceEvidenceLevel;
  /** Short label for the destination card. */
  label: string;
  /** One or two sentences: what at this site points to ice. */
  basis: string;
}

const TERRACED: IceEvidence = {
  level: "terraced",
  label: "Terraced crater, confirmed in HiRISE",
  basis:
    "Stepped crater walls show the impact broke through layers of different strength. Across Arcadia Planitia, radar ties those layers to a sheet of buried ice tens of metres thick (Bramson et al. 2015).",
};

const POSSIBLE_TERRACED: IceEvidence = {
  level: "possible-terraced",
  label: "Possible terraced crater",
  basis:
    "The terraces are not certain in the image. If they are real, they point to the same sheet of buried ice that radar maps across Arcadia Planitia (Bramson et al. 2015).",
};

const REGIONAL: IceEvidence = {
  level: "regional",
  label: "Regional evidence only",
  basis:
    "Ridges, not a crater: nothing at this site points to ice by itself. It lies in Arcadia Planitia, a region where orbital radar, thermal and neutron data point to shallow buried ice (Morgan et al. 2021).",
};

export const ICE_EVIDENCE: Record<string, IceEvidence> = {
  ESP_033225_2250: POSSIBLE_TERRACED,
  ESP_034082_2260: POSSIBLE_TERRACED,
  ESP_037352_2245: TERRACED,
  ESP_054060_2265: REGIONAL,
};

/** Applies to every site. */
export const ICE_EVIDENCE_CAVEAT =
  "Indirect evidence from orbit. No lander or drill has confirmed ice at any of these sites.";

export const ICE_EVIDENCE_CITATIONS = [
  "Bramson, A. M. et al. (2015). Widespread excess ice in Arcadia Planitia, Mars. GRL 42, 6566–6574.",
  "Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of Mars. Nature Astronomy 5, 230–236.",
];

export function iceEvidenceFor(hiriseId: string): IceEvidence | undefined {
  return ICE_EVIDENCE[hiriseId];
}
