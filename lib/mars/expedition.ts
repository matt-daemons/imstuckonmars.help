import { ROVER, ROVER_RULES } from "../flight-rules/rover-rules";
import { FLIGHT_RULES } from "../flight-rules/rules";
import { SOL_MINUTES, type DriveWalkPlan } from "./drive-walk";
import { legStepEnergiesWh, type DriveGrid, type PowerSource } from "./driving";
import { marsDistanceM, type PlannedPath } from "./routing";
import type { LngLat, RouteCollection, RouteLegProperties, TravelMode } from "./types";

export type LegPhase = "drive_out" | "walk_out" | "walk_back" | "drive_back";
export type ExpeditionPhase = LegPhase | "sampling" | "done";
export type Activity = "driving" | "parked" | "walking" | "sampling";
export type LimitingResource = "rover_battery" | "suit_oxygen";

const LEG_PHASES: Record<number, LegPhase> = {
  1: "drive_out",
  2: "walk_out",
  3: "walk_back",
  4: "drive_back",
};
const DRIVE_PATHS: Record<number, "outbound" | "back"> = { 1: "outbound", 4: "back" };

const BATTERY_CAPACITY_WH = ROVER.battery_kwh * 1000;
const BATTERY_RESERVE_WH = BATTERY_CAPACITY_WH * (ROVER_RULES.battery.no_go_below_percent / 100);
const SUIT_PRIMARY_MIN: number = FLIGHT_RULES.suit_supply.primary_minutes;
const SUIT_RESERVE_MIN = FLIGHT_RULES.suit_supply.reserve_minutes;
// A drive leg that ends this much later than its driving time spans whole sols.
const MULTI_SOL_TOLERANCE_MIN = 1e-6;

/** Real seconds each part of the trip plays for at 1×: the drive out, the walk with sampling, the drive back. */
export const PLAYBACK_SECONDS_PER_PART = 25;

/** One leg of a planned trip, as the simulation plays it. */
export interface ExpeditionLeg {
  phase: LegPhase;
  mode: TravelMode;
  /** The leg's line, in map longitudes. */
  coordinates: LngLat[];
  /** Planned path length, not odometer. */
  distanceKm: number;
  startMin: number;
  /** Time on the move, driving or walking, without nights or sampling. */
  travelMin: number;
  /** Time stopped at the leg's end, such as sampling at the POI after the walk out. */
  stopMin: number;
  /** When the next leg starts, or the trip ends; nights of multi-sol drives included. */
  endMin: number;
  /** Battery energy of each step between neighbouring coordinates, path factor included; [] on walks. */
  stepWh: number[];
}

/** A stretch of the trip with one activity, over which the values change smoothly. */
export interface Segment {
  phase: Exclude<ExpeditionPhase, "done">;
  activity: Activity;
  /** Index into the timeline's legs. */
  leg: number;
  startMin: number;
  endMin: number;
  /** Share of the leg's line covered at the segment's start and end. */
  fromFraction: number;
  toFraction: number;
  batteryStartWh: number;
  batteryEndWh: number;
  suitStartMin: number;
  suitEndMin: number;
}

/** Where along a leg's line each of its points lies, and the energy used up to it. */
interface LegTrack {
  fractions: number[];
  cumulativeWh: number[];
}

export interface ExpeditionTimeline {
  legs: ExpeditionLeg[];
  tracks: LegTrack[];
  segments: Segment[];
  totalMin: number;
  distanceTotalKm: number;
  battery: { capacityWh: number; reserveWh: number; lowestWh: number };
  suit: { primaryMin: number; reserveMin: number; lowestMin: number };
  /** The resource that comes closest to its reserve over the whole trip. */
  limiting: LimitingResource;
}

export interface ExpeditionState {
  phase: ExpeditionPhase;
  activity: Activity | "done";
  elapsedMin: number;
  /** 1-based sol of the trip. */
  sol: number;
  position: LngLat;
  /** Who is moving: the rover, or the crew on foot. */
  mode: TravelMode;
  leg: number;
  legFraction: number;
  distanceDoneKm: number;
  batteryWh: number;
  suitMin: number;
}

type LegFeature = Extract<RouteCollection["features"][number], { properties: RouteLegProperties }>;

/** The plan's four legs, ready to simulate; null unless the plan is ok. */
export function expeditionLegs(plan: DriveWalkPlan, driveGrid: DriveGrid): ExpeditionLeg[] | null {
  const { collection, drive } = plan;
  if (plan.status !== "ok" || !collection || !drive) return null;
  const features = collection.features
    .filter((feature): feature is LegFeature => feature.properties.kind === "route-leg")
    .sort((a, b) => a.properties.leg - b.properties.leg);
  return features.map((feature, index) => {
    const props = feature.properties;
    const drivePath = DRIVE_PATHS[props.leg];
    return {
      phase: LEG_PHASES[props.leg],
      mode: props.mode,
      coordinates: feature.geometry.coordinates,
      distanceKm: props.distance_km,
      startMin: props.start_offset_min,
      travelMin: props.est_time_min,
      stopMin: props.stop_min,
      endMin: features[index + 1]?.properties.start_offset_min ?? collection.route.est_time_min,
      stepWh: drivePath ? odometerStepWh(driveGrid, drive[drivePath]) : [],
    };
  });
}

// Real drives run longer than the planned path, and use energy for the extra distance too.
function odometerStepWh(grid: DriveGrid, path: PlannedPath): number[] {
  return legStepEnergiesWh(grid, path).map((wh) => wh * ROVER.path_factor);
}

/**
 * The SIMULATED trip as contiguous segments, with battery and suit supply at each segment's ends.
 * It replays the plan's own timeline and energy model; nothing here is measured.
 */
export function buildTimeline(legs: ExpeditionLeg[], power: PowerSource): ExpeditionTimeline {
  const tracks = legs.map(legTrack);
  const segments: Segment[] = [];
  let batteryWh = BATTERY_CAPACITY_WH;
  // ASSUMPTION: suits start the walk full; the main supply only drains while the crew is suited.
  let suitMin = SUIT_PRIMARY_MIN;
  legs.forEach((leg, index) => {
    const legSegments =
      leg.mode === "drive"
        ? driveSegments(leg, index, tracks[index], power, batteryWh, suitMin)
        : walkSegments(leg, index, batteryWh, suitMin);
    segments.push(...legSegments);
    const last = legSegments[legSegments.length - 1];
    batteryWh = last.batteryEndWh;
    suitMin = last.suitEndMin;
  });
  const lowestWh = Math.min(...segments.flatMap((s) => [s.batteryStartWh, s.batteryEndWh]));
  const lowestMin = Math.min(...segments.map((s) => s.suitEndMin));
  return {
    legs,
    tracks,
    segments,
    totalMin: legs[legs.length - 1].endMin,
    distanceTotalKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    battery: { capacityWh: BATTERY_CAPACITY_WH, reserveWh: BATTERY_RESERVE_WH, lowestWh },
    suit: { primaryMin: SUIT_PRIMARY_MIN, reserveMin: SUIT_RESERVE_MIN, lowestMin },
    limiting: limitingResource(lowestWh, lowestMin),
  };
}

function legTrack(leg: ExpeditionLeg): LegTrack {
  const cumulativeM = [0];
  const cumulativeWh = [0];
  for (let i = 1; i < leg.coordinates.length; i++) {
    cumulativeM.push(
      cumulativeM[i - 1] + marsDistanceM(leg.coordinates[i - 1], leg.coordinates[i]),
    );
    cumulativeWh.push(cumulativeWh[i - 1] + (leg.stepWh[i - 1] ?? 0));
  }
  const totalM = cumulativeM[cumulativeM.length - 1];
  const fractions = cumulativeM.map((m, i) =>
    totalM > 0 ? m / totalM : i / Math.max(1, cumulativeM.length - 1),
  );
  return { fractions, cumulativeWh };
}

/**
 * A drive of one sol or less is one segment. A longer one drives km_per_sol each sol, then parks
 * until the next sol, as the plan's timeline counts whole sols.
 */
function driveSegments(
  leg: ExpeditionLeg,
  index: number,
  track: LegTrack,
  power: PowerSource,
  batteryWh: number,
  suitMin: number,
): Segment[] {
  const energyAt = (fraction: number) => interpolate(track.fractions, track.cumulativeWh, fraction);
  const span = { leg: index, suitStartMin: suitMin, suitEndMin: suitMin };
  const isMultiSol = leg.endMin - leg.startMin > leg.travelMin + MULTI_SOL_TOLERANCE_MIN;
  if (!isMultiSol) {
    return [
      {
        ...span,
        phase: leg.phase,
        activity: "driving",
        startMin: leg.startMin,
        endMin: leg.endMin,
        fromFraction: 0,
        toFraction: 1,
        batteryStartWh: batteryWh,
        batteryEndWh: batteryWh - energyAt(1),
      },
    ];
  }
  const solDriveMin = (ROVER.km_per_sol[power] / ROVER.flat_speed_kmh) * 60;
  // The plan's timeline gives a multi-sol drive whole sols.
  const sols = Math.round((leg.endMin - leg.startMin) / SOL_MINUTES);
  const segments: Segment[] = [];
  let battery = batteryWh;
  for (let sol = 0; sol < sols; sol++) {
    const solStart = leg.startMin + sol * SOL_MINUTES;
    const isLastSol = sol === sols - 1;
    const solEnd = isLastSol ? leg.endMin : solStart + SOL_MINUTES;
    const drivenMin = Math.min(sol * solDriveMin, leg.travelMin);
    const leftMin = leg.travelMin - drivenMin;
    const driveMin = isLastSol ? leftMin : Math.min(solDriveMin, leftMin);
    const fromFraction = drivenMin / leg.travelMin;
    const toFraction = isLastSol ? 1 : (drivenMin + driveMin) / leg.travelMin;
    const driveEnd = solStart + driveMin;
    const afterDrive = battery - (energyAt(toFraction) - energyAt(fromFraction));
    segments.push({
      ...span,
      phase: leg.phase,
      activity: "driving",
      startMin: solStart,
      endMin: driveEnd,
      fromFraction,
      toFraction,
      batteryStartWh: battery,
      batteryEndWh: afterDrive,
    });
    segments.push(...parkedSegments(leg, span, power, driveEnd, solEnd, toFraction, afterDrive));
    battery = BATTERY_CAPACITY_WH;
  }
  return segments;
}

/**
 * Parked after a sol's drive: with solar power, life support runs on the battery overnight, as
 * the plan's energy model has it; then the battery recharges.
 * ASSUMPTION: the battery is full again by the next sol's drive (the plan's model starts every
 * sol full), recharged evenly over the rest of the stop.
 */
function parkedSegments(
  leg: ExpeditionLeg,
  span: Pick<Segment, "leg" | "suitStartMin" | "suitEndMin">,
  power: PowerSource,
  startMin: number,
  endMin: number,
  fraction: number,
  batteryWh: number,
): Segment[] {
  const parked = {
    ...span,
    phase: leg.phase,
    activity: "parked" as const,
    fromFraction: fraction,
    toFraction: fraction,
  };
  const overnightEnd = Math.min(endMin, startMin + ROVER.overnight_hours[power] * 60);
  const overnightWh = ROVER.hotel_kw * 1000 * ((overnightEnd - startMin) / 60);
  const segments: Segment[] = [];
  if (overnightEnd > startMin) {
    segments.push({
      ...parked,
      startMin,
      endMin: overnightEnd,
      batteryStartWh: batteryWh,
      batteryEndWh: batteryWh - overnightWh,
    });
  }
  segments.push({
    ...parked,
    startMin: overnightEnd,
    endMin,
    batteryStartWh: batteryWh - overnightWh,
    batteryEndWh: BATTERY_CAPACITY_WH,
  });
  return segments;
}

/**
 * Walking drains the suit's main supply minute for minute, and so does sampling at the POI.
 * ASSUMPTION: the parked rover's own draw during the walk is left out, as in the plan's energy model.
 */
function walkSegments(
  leg: ExpeditionLeg,
  index: number,
  batteryWh: number,
  suitMin: number,
): Segment[] {
  const span = { leg: index, batteryStartWh: batteryWh, batteryEndWh: batteryWh };
  const arriveMin = leg.startMin + leg.travelMin;
  const walking: Segment = {
    ...span,
    phase: leg.phase,
    activity: "walking",
    startMin: leg.startMin,
    endMin: leg.stopMin > 0 ? arriveMin : leg.endMin,
    fromFraction: 0,
    toFraction: 1,
    suitStartMin: suitMin,
    suitEndMin: suitMin - leg.travelMin,
  };
  if (leg.stopMin <= 0) return [walking];
  return [
    walking,
    {
      ...span,
      phase: "sampling",
      activity: "sampling",
      startMin: arriveMin,
      endMin: leg.endMin,
      fromFraction: 1,
      toFraction: 1,
      suitStartMin: walking.suitEndMin,
      suitEndMin: walking.suitEndMin - (leg.endMin - arriveMin),
    },
  ];
}

/** The resource with the least of its usable supply left at its lowest point. */
function limitingResource(lowestWh: number, lowestSuitMin: number): LimitingResource {
  const batteryShare = (lowestWh - BATTERY_RESERVE_WH) / (BATTERY_CAPACITY_WH - BATTERY_RESERVE_WH);
  const suitShare = (lowestSuitMin - SUIT_RESERVE_MIN) / (SUIT_PRIMARY_MIN - SUIT_RESERVE_MIN);
  return batteryShare <= suitShare ? "rover_battery" : "suit_oxygen";
}

/** The rover and crew `elapsedMin` after departure. */
export function stateAt(timeline: ExpeditionTimeline, elapsedMin: number): ExpeditionState {
  const { segments, legs, tracks, totalMin } = timeline;
  const t = Math.min(Math.max(elapsedMin, 0), totalMin);
  const isDone = t >= totalMin;
  const segment = isDone
    ? segments[segments.length - 1]
    : (segments.find((s) => t < s.endMin) ?? segments[segments.length - 1]);
  const duration = segment.endMin - segment.startMin;
  const progress = isDone || duration <= 0 ? 1 : (t - segment.startMin) / duration;
  const fraction = lerp(segment.fromFraction, segment.toFraction, progress);
  const leg = legs[segment.leg];
  const track = tracks[segment.leg];
  const batteryWh =
    segment.activity === "driving"
      ? segment.batteryStartWh -
        (interpolate(track.fractions, track.cumulativeWh, fraction) -
          interpolate(track.fractions, track.cumulativeWh, segment.fromFraction))
      : lerp(segment.batteryStartWh, segment.batteryEndWh, progress);
  const doneBefore = legs.slice(0, segment.leg).reduce((sum, l) => sum + l.distanceKm, 0);
  return {
    phase: isDone ? "done" : segment.phase,
    activity: isDone ? "done" : segment.activity,
    elapsedMin: t,
    sol: Math.min(Math.floor(t / SOL_MINUTES), Math.ceil(totalMin / SOL_MINUTES) - 1) + 1,
    position: pointAlong(leg.coordinates, track.fractions, fraction),
    mode: leg.mode,
    leg: segment.leg,
    legFraction: fraction,
    distanceDoneKm: doneBefore + fraction * leg.distanceKm,
    batteryWh,
    suitMin: lerp(segment.suitStartMin, segment.suitEndMin, progress),
  };
}

/** The lines covered so far, one per leg started, each with its travel mode. */
export function travelledLines(
  timeline: ExpeditionTimeline,
  state: ExpeditionState,
): { mode: TravelMode; coordinates: LngLat[] }[] {
  return timeline.legs.slice(0, state.leg + 1).map((leg, index) => {
    if (index < state.leg) return { mode: leg.mode, coordinates: leg.coordinates };
    const fractions = timeline.tracks[index].fractions;
    const passed = leg.coordinates.filter((_, i) => fractions[i] < state.legFraction);
    return { mode: leg.mode, coordinates: [...passed, state.position] };
  });
}

/**
 * The elapsed minutes after `realSeconds` of playback at 1×. Each part of the trip (the drive out,
 * the walk with sampling, the drive back) plays for PLAYBACK_SECONDS_PER_PART, so the walk, a few
 * hours, is not over in a blink next to drives of several sols. A long frame carries over from
 * one part into the next at that part's pace.
 */
export function advancePlayback(
  timeline: ExpeditionTimeline,
  elapsedMin: number,
  realSeconds: number,
): number {
  let minutes = elapsedMin;
  let secondsLeft = realSeconds;
  for (const part of playbackParts(timeline.legs)) {
    if (minutes >= part.endMin) continue;
    const minutesPerSecond = Math.max(part.endMin - part.startMin, 1) / PLAYBACK_SECONDS_PER_PART;
    const secondsToPartEnd = (part.endMin - minutes) / minutesPerSecond;
    if (secondsLeft <= secondsToPartEnd) return minutes + secondsLeft * minutesPerSecond;
    secondsLeft -= secondsToPartEnd;
    minutes = part.endMin;
  }
  return timeline.totalMin;
}

/** Consecutive legs of the same travel mode, merged. */
function playbackParts(legs: ExpeditionLeg[]): { startMin: number; endMin: number }[] {
  const parts: { mode: TravelMode; startMin: number; endMin: number }[] = [];
  for (const leg of legs) {
    const last = parts[parts.length - 1];
    if (last?.mode === leg.mode) last.endMin = leg.endMin;
    else parts.push({ mode: leg.mode, startMin: leg.startMin, endMin: leg.endMin });
  }
  return parts;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** The value at `x` on the piecewise-linear curve through (xs[i], ys[i]); xs ascend. */
function interpolate(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const after = xs.findIndex((value) => value >= x);
  if (after === -1) return ys[ys.length - 1];
  const span = xs[after] - xs[after - 1];
  return span > 0 ? lerp(ys[after - 1], ys[after], (x - xs[after - 1]) / span) : ys[after];
}

function pointAlong(coordinates: LngLat[], fractions: number[], fraction: number): LngLat {
  return [
    interpolate(
      fractions,
      coordinates.map(([lng]) => lng),
      fraction,
    ),
    interpolate(
      fractions,
      coordinates.map(([, lat]) => lat),
      fraction,
    ),
  ];
}
