import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ICE_EVIDENCE, ICE_EVIDENCE_CAVEAT, iceEvidenceFor } from "./ice-evidence";

interface SiteProps {
  kind: string;
  hirise_id: string;
  site_kind: "crater" | "ridges";
  confirmed: boolean;
}

async function pois(): Promise<SiteProps[]> {
  const text = await readFile("public/data/processed/sites.geojson", "utf8");
  const features = JSON.parse(text).features as { properties: SiteProps }[];
  return features.map((f) => f.properties).filter((p) => p.kind === "poi");
}

describe("ice evidence", () => {
  it("covers every water-ice site and no others", async () => {
    const ids = (await pois()).map((p) => p.hirise_id).toSorted();
    expect(Object.keys(ICE_EVIDENCE).toSorted()).toEqual(ids);
  });

  it("matches each site's kind and whether its terraces are confirmed", async () => {
    for (const site of await pois()) {
      const expected =
        site.site_kind === "ridges"
          ? "regional"
          : site.confirmed
            ? "terraced"
            : "possible-terraced";
      expect(iceEvidenceFor(site.hirise_id)?.level, site.hirise_id).toBe(expected);
    }
  });

  it("never claims ice is confirmed on the ground", () => {
    expect(ICE_EVIDENCE_CAVEAT).toContain("No lander or drill has confirmed ice");
    for (const evidence of Object.values(ICE_EVIDENCE)) {
      expect(evidence.basis).toMatch(/Bramson et al\. 2015|Morgan et al\. 2021/);
    }
  });
});
