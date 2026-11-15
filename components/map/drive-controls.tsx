"use client";

import { useId } from "react";

import {
  Select,
  SelectItem,
  SelectLabel,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PowerSource } from "@/lib/mars/driving";
import { marsDistanceM } from "@/lib/mars/routing";
import type { LngLat } from "@/lib/mars/types";

import type { SitePoi } from "./scene-panel";

/** The sites, nearest to the base first by straight-line distance. */
export function nearestFirst(sites: SitePoi[], base: LngLat): SitePoi[] {
  return sites.toSorted((a, b) => marsDistanceM(base, a.center) - marsDistanceM(base, b.center));
}

/** Named the way the scene panel names them. */
function siteLabel(site: SitePoi): string {
  return site.confirmed ? site.title : `${site.title} (unconfirmed)`;
}

/** The destination and power choices of a driving mission. */
export function DriveControls({
  sites,
  destination,
  onDestination,
  power,
  onPower,
}: {
  sites: SitePoi[];
  /** The site the end is on, or null when the end was set on the map. */
  destination: SitePoi | null;
  onDestination: (site: SitePoi) => void;
  power: PowerSource;
  onPower: (power: PowerSource) => void;
}) {
  const powerLabel = useId();
  const items = sites.map((site) => ({ value: site.id, label: siteLabel(site) }));
  return (
    <div className="flex flex-col gap-3">
      <Select
        items={items}
        value={destination?.id ?? null}
        onValueChange={(id) => {
          const site = sites.find((candidate) => candidate.id === id);
          if (site) onDestination(site);
        }}
      >
        <SelectLabel>Destination</SelectLabel>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Point set on the map" />
        </SelectTrigger>
        <SelectPopup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <div className="flex flex-col gap-2">
        <span id={powerLabel} className="text-sm font-medium">
          Power
        </span>
        <ToggleGroup
          aria-labelledby={powerLabel}
          variant="outline"
          size="sm"
          value={[power]}
          // Pressing the pressed item empties the value; keep the current source then.
          // Safe cast: the only values are the two items below.
          onValueChange={(value) => value[0] && onPower(value[0] as PowerSource)}
        >
          <ToggleGroupItem value="fission">Fission</ToggleGroupItem>
          <ToggleGroupItem value="solar">Solar</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
