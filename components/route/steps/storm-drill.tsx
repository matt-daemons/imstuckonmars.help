"use client";

import { useId, useRef } from "react";

import { AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@/components/ui/number-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SolarAlertLevel } from "@/lib/flight-rules/solar-alert";
import { DUST_FIELDS } from "@/lib/mars/dust-simulation";

import { isDrillSet, NO_DRILL } from "../conditions";
import { useConditions } from "../conditions-provider";

/**
 * Step 03's storm drill, closed by default: sets a solar alert, a dust opacity or a start time by
 * hand, to rehearse a storm. Each set value is labelled as drill in the verdict's reasons.
 */
export function StormDrill() {
  const { drill, setDrill } = useConditions();
  const alertLabel = useId();
  // Clear drill disables itself, so focus moves here instead of dropping to the page.
  const realItem = useRef<HTMLButtonElement>(null);
  const drilling = isDrillSet(drill);
  return (
    <AccordionItem value="storm-drill">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          Storm drill
          {drilling && (
            <Badge variant="info" className="font-mono">
              DRILL
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionPanel className="flex flex-col gap-3 text-foreground">
        <p className="text-xs">
          Sets storm values by hand. The verdict marks each one &ldquo;Drill, not real data&rdquo;.
          An empty field keeps the real value.
        </p>
        <div className="flex flex-col gap-2">
          <span id={alertLabel} className="text-sm font-medium">
            Solar alert
          </span>
          <ToggleGroup
            aria-labelledby={alertLabel}
            variant="outline"
            size="sm"
            value={[drill.solar_alert_level ?? "off"]}
            // Pressing the pressed item empties the value; keep the current level then.
            // Safe cast: the only values are the items below.
            onValueChange={(value) => {
              const level = value[0] as SolarAlertLevel | "off" | undefined;
              if (level) setDrill({ ...drill, solar_alert_level: level === "off" ? null : level });
            }}
          >
            {/* "Real", as the empty fields below say, so it is not mistaken for a drilled "None". */}
            <ToggleGroupItem ref={realItem} value="off">
              Real
            </ToggleGroupItem>
            <ToggleGroupItem value="none">None</ToggleGroupItem>
            <ToggleGroupItem value="watch">Watch</ToggleGroupItem>
            <ToggleGroupItem value="warning">Warning</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <NumberField
          size="sm"
          value={drill.dust_opacity}
          onValueChange={(opacity) => setDrill({ ...drill, dust_opacity: opacity })}
          min={0}
          max={DUST_FIELDS.tau_current.maximum}
          step={0.1}
          format={{ minimumFractionDigits: 1, maximumFractionDigits: 2 }}
        >
          <NumberFieldScrubArea label="Dust opacity (τ)" />
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput className="text-right" placeholder="Real" />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
        <NumberField
          size="sm"
          value={drill.start_local_hour}
          onValueChange={(hour) => setDrill({ ...drill, start_local_hour: hour })}
          min={0}
          max={23}
          step={1}
          format={{ maximumFractionDigits: 0 }}
        >
          <NumberFieldScrubArea label="Start time (local solar hour, 0–23)" />
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput className="text-right" placeholder="Now" />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
        <Button
          size="sm"
          variant="outline"
          disabled={!drilling}
          onClick={() => {
            setDrill(NO_DRILL);
            realItem.current?.focus();
          }}
          className="self-start"
        >
          Clear drill
        </Button>
      </AccordionPanel>
    </AccordionItem>
  );
}
