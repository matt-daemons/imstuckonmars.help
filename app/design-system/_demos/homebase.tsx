"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/homebase/dashboard";
import { ObservationPlot } from "@/components/homebase/observation-plot";
import { ExperimentLog } from "@/components/homebase/experiment-log";
import { ConsolePane } from "@/components/homebase/pane";
import type { HomebaseMetric } from "@/lib/homebase/types";
import { Section } from "../_components/section";

const fixture: HomebaseMetric = {
  id: "temperature",
  title: "Fixture temperature",
  unit: "K",
  decimals: 1,
  value: 202,
  observed_utc_ms: 240000,
  status: "available",
  minimum: 200,
  maximum: 205,
  source: { instrument: "Fixture", site: "Design system", url: null, product_id: null },
  note: "Synthetic design-system fixture, not NASA measurements.",
  cadence_s: 60,
  points: [
    { utc_ms: 0, value: 200, count: 1 },
    { utc_ms: 60000, value: 205, count: 1 },
    { utc_ms: 120000, value: null, count: 0 },
    { utc_ms: 180000, value: 204, count: 1 },
    { utc_ms: 240000, value: 202, count: 1 },
  ],
};

export function HomebaseComponents() {
  const [generation, setGeneration] = useState(1);
  return (
    <>
      <Section id="homebase-readout" title="Archive readout" className="flex-col">
        <p>
          Homebase is a read-only tiled terminal workspace, not a mission launcher. Numeric values
          are single text nodes with a short settling transition, not rolling glyphs or substitute
          numbers. Reduced motion renders them immediately. Assumed viewing distance: 600 mm
          desktop, 400 mm handheld. Labels remain at least 16 px. Secondary text uses the scoped{" "}
          <code>--hb-muted</code> token (<code>#a2b8ba</code>) on the existing black and teal
          surfaces.
        </p>
        <Button variant="outline" onClick={() => setGeneration((n) => n + 1)}>
          Replay readout animation
        </Button>
        <div className="homebase-dashboard hb-component-demo max-w-md">
          <ConsolePane
            id="fixture-console-pane"
            title="Reference readout"
            number="01"
            detail="Fixture"
          >
            <MetricCard metric={fixture} selected onSelect={() => {}} revealKey={generation} />
          </ConsolePane>
        </div>
      </Section>
      <Section id="homebase-history" title="Observation history" className="flex-col">
        <p>
          The overview shows four compact plots simultaneously; narrow displays keep every readout
          visible and select one plot. Zoom opens a fixed-screen inspector with chart and paginated
          values/source views. Missing or flagged samples break the signal. This is a synthetic
          fixture, not NASA data.
        </p>
        <div className="homebase-dashboard hb-component-demo">
          <ObservationPlot metric={fixture} from={0} to={240000} revealKey={generation} />
        </div>
      </Section>
      <Section id="homebase-log" title="Experiment log" className="flex-col">
        <p>
          Separate fixed-screen archive with paginated rows, sol filtering, per-run notes and
          missing output distinct from zero. These two records are UI fixtures only.
        </p>
        <div className="homebase-dashboard hb-component-demo">
          <ExperimentLog
            today={1}
            experiments={[
              {
                id: "fixture-1",
                sol: 1,
                oxygen_g: 2.5,
                peak_rate_g_h: 6,
                active_mean_g_h: 5,
                active_seconds: 1800,
                energy_wh: 200,
                warnings: ["Design-system fixture, not NASA data"],
                source_url: null,
              },
              {
                id: "fixture-2",
                sol: 2,
                oxygen_g: null,
                peak_rate_g_h: null,
                active_mean_g_h: null,
                active_seconds: null,
                energy_wh: null,
                warnings: ["Design-system fixture, no derived output"],
                source_url: null,
              },
            ]}
          />
        </div>
      </Section>
    </>
  );
}
