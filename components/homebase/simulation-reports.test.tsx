import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildExpeditionConfig } from "@/lib/mission/expedition";
import { evaluateMission } from "@/lib/mission/engine";
import type { MissionReport } from "@/lib/mission/client";
import { reportOutcome, SavedReportCard } from "./simulation-reports";

// These framework-bound siblings are not used by the standalone card.
vi.mock("@/components/expedition/expedition-provider", () => ({ useExpedition: () => ({}) }));
vi.mock("@/components/expedition/report-dialog", () => ({ ReportViewer: () => null }));

const config = buildExpeditionConfig(
  {
    id: "report-removal-fixture",
    mode: "walking",
    shelter_lnglat: [-176.05, 45.97],
    outbound: {
      path: [
        [-176.05, 45.97],
        [-176.04, 45.97],
      ],
      duration_s: 1800,
    },
    sampling_s: 600,
    back: {
      path: [
        [-176.04, 45.97],
        [-176.05, 45.97],
      ],
      duration_s: 1800,
    },
  },
  "fixture",
  1,
);
const report: MissionReport = {
  mission_id: "report-removal-fixture",
  revision: 0,
  at_s: 1200,
  status: "ok",
  ended_by_operator: true,
  config,
  events: [],
  series: [],
  final: evaluateMission(config, [], [], 1200),
  provenance: "Synthetic test fixture",
};

describe("saved report actions", () => {
  it("does not label a manually ended run Returned even if its last position was at shelter", () => {
    const ended = {
      ...report,
      final: {
        ...report.final,
        position: { ...report.final.position!, phase: "shelter" as const },
      },
    };
    expect(reportOutcome({ id: "ended", saved_at_ms: 0, report: ended })).toBe("Ended by operator");
  });

  it("retains a power failure in the saved outcome even with positive reserves", () => {
    const failed: MissionReport = {
      ...report,
      ended_by_operator: false,
      final: {
        ...report.final,
        position: { ...report.final.position!, phase: "shelter" },
        battery: { ...report.final.battery, eva: { ...report.final.battery.eva, unmet_wh: 1 } },
      },
    };
    expect(reportOutcome({ id: "failed", saved_at_ms: 0, report: failed })).toBe(
      "Returned · suit constraint violated",
    );
  });
  it("offers separate, named open and remove controls without hiding report identity", () => {
    const markup = renderToStaticMarkup(
      <SavedReportCard
        saved={{ id: "report-removal-fixture:0", saved_at_ms: Date.UTC(2026, 10, 15, 12), report }}
        onOpen={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(markup).toContain('aria-label="Open report saved 2026-11-15T12:00:00.000Z"');
    expect(markup).toContain('aria-label="Remove report saved 2026-11-15T12:00:00.000Z"');
    expect(markup).toContain("report-removal-fixture:0");
    expect(markup).toContain("Habitat walk");
    expect(markup.match(/<button /g)).toHaveLength(2);
  });
});
