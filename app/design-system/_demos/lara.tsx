"use client";

import { useState } from "react";
import { LaraVitalsView } from "@/components/copilot/lara-vitals";
import { LaraReplyView } from "@/components/copilot/lara-reply";
import { laraLauncherText } from "@/lib/copilot/speech";
import { Section } from "../_components/section";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { Lara } from "@/components/copilot/lara-context";

const snapshot: NonNullable<Lara["snapshot"]> = {
  revision: 1,
  clock: { mode: "paused", position_s: 90, speed: 20 },
  config: {
    base: { id: "fixture" },
    duration_s: 3600,
    oxygen: { base: { reserve_g: 60 }, eva: { reserve_g: 60 } },
    battery: { base: { reserve_wh: 89 }, eva: { reserve_wh: 89 } },
  },
  state: {
    activity: "eva",
    reasons: [],
    oxygen: { base: { remaining_g: 900 }, eva: { remaining_g: 720 } },
    battery: { base: { remaining_wh: 1200 }, eva: { remaining_wh: 900 } },
  },
  observed: { radiation: { status: "unavailable", observation: null } },
};

export function LaraDemos() {
  const [speaking, setSpeaking] = useState(true);
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Section id="lara-voice" title="LARA voice states" className="flex-col">
        <p>Synthetic UI fixtures. No microphone, speech service or mission commands.</p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["idle", "", "listening"],
              ["listening", "", "paused"],
              ["listening", "How much oxygen is left", "paused"],
              ["thinking", "", "paused"],
            ] as const
          ).map(([status, transcript, wake]) => (
            <Button key={status + transcript} variant="outline">
              <Sparkles aria-hidden />
              {laraLauncherText(status, transcript, wake)}
            </Button>
          ))}
        </div>
        <div className="relative min-h-80 w-full border">
          <Button
            onClick={() => {
              setVisible(true);
              setSpeaking(true);
            }}
          >
            Show reply fixture
          </Button>
          <LaraReplyView
            reply={
              visible
                ? {
                    id: 1,
                    text: "The modeled suit oxygen is above its reserve. This is a simulation, not a safety assessment.",
                    visibleText: speaking
                      ? "The modeled suit oxygen"
                      : "The modeled suit oxygen is above its reserve. This is a simulation, not a safety assessment.",
                    speaking,
                  }
                : null
            }
            onStop={() => setSpeaking(false)}
            onDismiss={() => setVisible(false)}
          />
        </div>
      </Section>
      <Section id="lara-vitals" title="Map vitals" className="flex-col">
        <div className="grid w-full gap-4 lg:grid-cols-2">
          <LaraVitalsView
            snapshot={snapshot}
            ageSeconds={0}
            pending={false}
            error={null}
            onToggle={() => {}}
          />
          <LaraVitalsView
            snapshot={snapshot}
            ageSeconds={12}
            pending={false}
            error={null}
            onToggle={() => {}}
          />
        </div>
      </Section>
    </>
  );
}
