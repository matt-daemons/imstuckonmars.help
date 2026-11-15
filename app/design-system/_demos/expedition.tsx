"use client";

import { CircleXIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpeditionGauge } from "@/components/expedition/expedition-hud";
import { ReportChart } from "@/components/expedition/report-dialog";
import { SavedReportCard } from "@/components/homebase/simulation-reports";
import "@/components/homebase/terminal.css";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { evaluateMission } from "@/lib/mission/engine";
import { buildExpeditionConfig } from "@/lib/mission/expedition";
import type { MissionReport } from "@/lib/mission/client";
import { Section } from "../_components/section";
import "@/components/expedition/expedition.css";

const config = buildExpeditionConfig(
  {
    id: "design-system-fixture",
    mode: "walking",
    shelter_lnglat: [-176.05, 45.97],
    outbound: {
      path: [
        [-176.05, 45.97],
        [-176.04, 45.97],
      ],
      duration_s: 1800,
    },
    sampling_s: 3600,
    back: {
      path: [
        [-176.04, 45.97],
        [-176.05, 45.97],
      ],
      duration_s: 1800,
    },
  },
  "synthetic-fixture",
  1,
);
const series: MissionReport["series"] = [];
const final = evaluateMission(
  config,
  [
    {
      source_row: 1,
      segment_id: 0,
      elapsed_ms: 0,
      sclk_ms: null,
      utc_ms: null,
      oxygen_rate_g_h: 0,
      total_power_w: 0,
    },
  ],
  [],
  config.duration_s,
  {
    times: Array.from({ length: 30 }, (_, i) => i * 300),
    record: (s) =>
      series.push({
        t: s.elapsed_s,
        activity: s.activity,
        phase: s.position?.phase ?? null,
        distance_m: s.position?.distance_from_shelter_m ?? null,
        travelled_m: s.position?.travelled_m ?? null,
        suit_oxygen_g: s.oxygen.eva.remaining_g,
        suit_energy_wh: s.battery.eva.remaining_wh,
        shelter_oxygen_g: s.oxygen.base.remaining_g,
        shelter_energy_wh: s.battery.base.remaining_wh,
        reasons: s.reasons,
      }),
  },
);
const report: MissionReport = {
  mission_id: "fixture",
  ended_by_operator: false,
  revision: 0,
  at_s: final.elapsed_s,
  status: final.status,
  config,
  events: [],
  final,
  series,
  provenance: "Synthetic design-system fixture, not NASA measurements",
};

export function ExpeditionComponents() {
  return (
    <>
      <Section id="saved-simulation-report" title="Saved simulation report" className="flex-col">
        <p>
          Read-only browser history, separate from NASA experiments. Synthetic specimen; not saved
          to the report archive.
        </p>
        <div className="homebase-dashboard hb-component-demo w-full">
          <SavedReportCard
            saved={{ id: "fixture:0", saved_at_ms: Date.UTC(2026, 10, 15, 12), report }}
            onOpen={() => {}}
          />
        </div>
      </Section>
      <Section id="expedition-gauges" title="Expedition supplies" className="flex-col">
        <p>
          Synthetic fixtures. The tick marks a reserve, not zero. Labels and icons distinguish
          threshold states without color. Assumed viewing distance: 600 mm desktop, 400 mm handheld.
        </p>
        <div className="expedition-hud">
          <div className="hud-row hud-gauges">
            <ExpeditionGauge
              label="Suit O₂"
              value="720"
              unit="g"
              fraction={0.75}
              reserveFraction={0.0625}
              tone="nominal"
              detail="−120 g/h · reserve in 5 h 30 min"
            />
            <ExpeditionGauge
              label="Suit O₂"
              value="90"
              unit="g"
              fraction={0.094}
              reserveFraction={0.0625}
              tone="warning"
              detail="−120 g/h · reserve in 15 min"
            />
            <ExpeditionGauge
              label="Suit O₂"
              value="40"
              unit="g"
              fraction={0.042}
              reserveFraction={0.0625}
              tone="error"
              detail="20 g below reserve"
            />
          </div>
        </div>
      </Section>
      <Section id="expedition-alerts" title="Expedition return alert" className="flex-col">
        <Alert variant="error">
          <CircleXIcon aria-hidden />
          <AlertTitle>Error · Return reserve at risk</AlertTitle>
          <AlertDescription>
            Fixture: continuing leaves suit oxygen 120 g below reserve. Response: compare turn-back
            and reduced-sampling options before confirming a replan.
          </AlertDescription>
        </Alert>
        <p>
          Live alerts expose their ID, mission time, source, acknowledgment and inhibition state in
          04 Run. Acknowledgment never changes the simulation.
        </p>
      </Section>
      <Section id="expedition-end" title="End simulation" className="flex-col">
        <Button variant="destructive-outline" disabled>
          <SquareIcon aria-hidden />
          End simulation
        </Button>
        <p>
          Unavailable specimen. On the map this command requires confirmation, preserves the final
          position and resources, and opens the report. Ended runs cannot resume without restarting.
          Canceling the confirmation leaves the run unchanged.
        </p>
      </Section>
      <Section id="expedition-report" title="Expedition report chart" className="flex-col">
        <p>
          Synthetic fixture. Solid oxygen and dashed battery traces, separate reserve lines, phase
          shading and event/replan markers. The report preserves the initial sampling goal after
          replanning.
        </p>
        <ReportChart report={report} />
      </Section>
    </>
  );
}
