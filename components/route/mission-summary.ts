import { formatNumber } from "@/components/map/drive-result";
import type { Plan } from "@/components/map/route-layers";
import type { SitePoi } from "@/components/map/scene-panel";
import { evaluateRoute } from "@/lib/flight-rules/evaluate";
import { SOL_MINUTES } from "@/lib/mars/drive-walk";
import type { PowerSource } from "@/lib/mars/driving";
import type { PlannedPath } from "@/lib/mars/routing";
import { SOURCE_GROUPS } from "@/lib/mars/sources";
import type { RouteCollection, RouteLegProperties } from "@/lib/mars/types";

import type { MissionType } from "./route-plan";
import { walkMargin, type StripField } from "./strip-fields";

type Site = Pick<SitePoi, "id" | "hiriseId" | "title">;

/** Minutes after departure as sols/hh:mm, the day count first as the time rules ask. */
export function afterDeparture(minutes: number): string {
  const sols = Math.floor(minutes / SOL_MINUTES);
  return `${sols}/${hoursMinutes(minutes - sols * SOL_MINUTES)}`;
}

/** A duration as hh:mm; a long drive runs past 24 h. */
export function hoursMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
}

/** A distance in km: 1 decimal from 10 km up, else 2, so the same leg reads the same everywhere. */
export function formatKm(km: number): string {
  return `${formatNumber(km, km >= 10 ? 1 : 2)} km`;
}

/** The summary's opening lines: what the mission is, where it goes, and when it was planned. */
export function titleRows({
  mission,
  site,
  power,
  samplingMin,
  madeAt,
}: {
  mission: MissionType;
  site: Site | null;
  power: PowerSource;
  samplingMin: number;
  madeAt: Date;
}): StripField[] {
  const iso = madeAt.toISOString();
  const rows: StripField[] = [
    { label: "Mission", value: mission === "walking" ? "Walking" : "Drive + walk" },
    { label: "Destination", value: site ? `${site.title} · ${site.hiriseId}` : "Map point" },
  ];
  // Only drive + walk has a rover; both mission modes can include sampling.
  if (mission === "drive-walk") {
    rows.push({ label: "Power", value: `${power[0].toUpperCase()}${power.slice(1)}` });
  }
  rows.push({ label: "Sampling time", value: `${samplingMin} min` });
  rows.push({ label: "Plan made", value: `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` });
  return rows;
}

/** What the mission is for, in one line. */
export function objectiveText(
  mission: MissionType,
  site: Site | null,
  samplingMin: number,
  fromHabitat: boolean,
): string {
  if (mission === "drive-walk" && site) {
    return `Sample water ice at ${site.title} (${site.hiriseId}), ${samplingMin} min at the site.`;
  }
  const home = fromHabitat ? "the habitat" : "the start";
  return samplingMin > 0
    ? `Walk to the map point, sample for ${samplingMin} min, then return to ${home}.`
    : `Walk to the map point and back to ${home}.`;
}

/** One line of the timeline: a leg, or the stop at the end of one. Values carry their units. */
export interface TimelineRow {
  id: string;
  /** The leg number; empty for a stop. */
  leg: string;
  mode: string;
  places: string;
  start: string;
  duration: string;
  distance: string;
  slope: string;
  shelter: string;
}

// What the agreed route format's place ids are called on screen; a site id is named by the caller.
const PLACE_NAMES: Partial<Record<string, string>> = {
  base: "Habitat",
  staging: "Staging point",
  start: "Start",
  "map-point": "Map point",
};

/** A row per leg in travel order, with a row for any stop (sampling) after the leg it ends. */
export function timelineRows(
  collection: RouteCollection,
  siteNames: Partial<Record<string, string>>,
): TimelineRow[] {
  const name = (id: string) => siteNames[id] ?? PLACE_NAMES[id] ?? id;
  const shelter = (leg: RouteLegProperties) => `${formatNumber(leg.time_to_shelter_min, 0)} min`;
  return legsOf(collection).flatMap((leg) => {
    const row: TimelineRow = {
      id: `leg-${leg.leg}`,
      leg: String(leg.leg),
      mode: leg.mode === "drive" ? "Drive" : "Walk",
      places: `${name(leg.from)} → ${name(leg.to)}`,
      start: afterDeparture(leg.start_offset_min),
      duration: hoursMinutes(leg.est_time_min),
      distance: formatKm(leg.distance_km),
      slope: `${formatNumber(leg.max_slope, 1)}°`,
      shelter: shelter(leg),
    };
    if (leg.stop_min <= 0) return [row];
    const stop: TimelineRow = {
      id: `stop-${leg.leg}`,
      leg: "",
      mode: "Sampling",
      places: `At ${name(leg.to)}`,
      start: afterDeparture(leg.start_offset_min + leg.est_time_min),
      duration: hoursMinutes(leg.stop_min),
      distance: "—",
      slope: "—",
      shelter: shelter(leg),
    };
    return [row, stop];
  });
}

function legsOf(collection: RouteCollection): RouteLegProperties[] {
  return collection.features.flatMap(({ properties }) =>
    properties.kind === "route-leg" ? [properties] : [],
  );
}

/**
 * A walk in the agreed route format: one walk leg out to the map point and one back, as the
 * drive + walk planner writes its legs. A walk ends at no site, so its place id is "map-point",
 * and it starts at "base" only when it starts at the habitat. Its verdict is the route check
 * alone, like the drive + walk collection's: storm conditions are not part of the file.
 * Null until the walk is planned.
 */
export function walkingCollection(
  plan: Plan,
  fromHabitat: boolean,
  samplingMin = 0,
): RouteCollection | null {
  const { outbound, back, summary } = plan;
  if (!summary) return null;
  const check = evaluateRoute(summary);
  const home = fromHabitat ? "base" : "start";
  const leg = (
    number: number,
    [from, to]: [string, string],
    path: PlannedPath,
    start: number,
  ): RouteCollection["features"][number] => ({
    type: "Feature",
    properties: {
      kind: "route-leg",
      route_id: "walk-map-point",
      leg: number,
      mode: "walk",
      from,
      to,
      start_offset_min: start,
      est_time_min: path.time_min,
      stop_min: number === 1 ? samplingMin : 0,
      distance_km: path.distance_m / 1000,
      max_slope: path.max_slope_deg,
      verdict: check.verdict,
      limiting_factor: check.limiting_factor,
      reasons: check.reasons,
      // The walk back from the map point, the farthest point, as the verdict strip counts it.
      time_to_shelter_min: back.time_min,
      simulated: false,
    },
    geometry: { type: "LineString", coordinates: path.path },
  });
  const { resource, value, limit, unit } = walkMargin(summary, check.limiting_factor);
  return {
    type: "FeatureCollection",
    features: [
      leg(1, [home, "map-point"], outbound, 0),
      leg(2, ["map-point", home], back, outbound.time_min + samplingMin),
    ],
    route: {
      route_id: "walk-map-point",
      title: `${fromHabitat ? "Habitat" : "Start"} → map point (walking)`,
      destination_id: "map-point",
      distance_km: (outbound.distance_m + back.distance_m) / 1000,
      est_time_min: summary.est_time_min,
      max_slope: summary.max_slope,
      verdict: check.verdict,
      limiting_factor: check.limiting_factor,
      reasons: check.reasons,
      margin: { resource, value, limit, unit },
      time_to_shelter_min: back.time_min,
      simulated: false,
      source: "MOLA/HRSC 200 m blend; Tobler hiking time (Earth model)",
    },
  };
}

/** The downloaded file's name: the route and the UTC day it was saved. */
export function routeFileName(collection: RouteCollection, savedAt: Date): string {
  return `lara-route-${collection.route.route_id}-${savedAt.toISOString().slice(0, 10)}.geojson`;
}

/** The route planner's citations from the sources screen, which lists the rest. */
export const ROUTE_PLANNER_CITATIONS: string[] =
  SOURCE_GROUPS.flatMap((group) => group.entries).find((entry) => entry.id === "route-planner")
    ?.citations ?? [];
