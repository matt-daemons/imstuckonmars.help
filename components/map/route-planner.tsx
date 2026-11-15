"use client";

import { ChevronDownIcon } from "lucide-react";
import type { LngLat as MapLibreLngLat, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { MissionType } from "@/components/route/route-plan";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appendCorner } from "@/lib/mars/route-zones";
import type { LngLat } from "@/lib/mars/types";

import { ClearZonesButton } from "./clear-zones-button";
import { DriveControls } from "./drive-controls";
import { DriveWalkAssumptions, DriveWalkResult } from "./drive-walk-result";
import { MapPanel } from "./map-panel";
import { draftFeatures, setData } from "./route-layers";
import { RouteLegend } from "./route-legend";
import { RouteResult, WalkAssumptions } from "./route-result";
import type { SitePoi } from "./scene-panel";

type Mode = "start" | "end" | "zone" | null;

const MODE_HINTS: Record<Exclude<Mode, null>, string> = {
  start: "Click the map to set the start.",
  end: "Click the map to set the end.",
  zone: "Click the map to add corners. Double-click to finish.",
};

interface RoutePlannerProps {
  map: MapLibreMap | null;
  base: LngLat;
  target: LngLat;
}

/**
 * The route choices and results of the shared route plan, with placing points and drawing no-go
 * zones on the map. Placing is transient, so its mode and the zone draft stay here.
 */
export function RoutePlanner({ map, base, target }: RoutePlannerProps) {
  const { inputs, dispatch, walk, journey, destinations, destination } = useRoutePlan();
  const { mission, start, power, samplingMin, zones } = inputs;
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const zonesDrawn = useRef(0);
  const drawZoneItem = useRef<HTMLButtonElement>(null);
  const driving = mission === "drive-walk";

  useEffect(() => setData(map, "zone-draft", draftFeatures(draft)), [map, draft]);

  // Each mission starts from its defaults: walking to the science stop, drive + walk to the nearest site.
  function chooseMission(next: MissionType) {
    const nextEnd = next === "drive-walk" ? (destinations[0]?.center ?? target) : target;
    dispatch({ type: "setMission", mission: next, start: base, end: nextEnd });
    if (next === "drive-walk") frame([base, nextEnd]);
    else map?.flyTo({ center: base, zoom: 12 });
  }

  function chooseDestination(site: SitePoi) {
    dispatch({ type: "setEnd", point: site.center });
    frame([start, site.center]);
  }

  // Fits the points between the panels. Called only from the operator's own choices, so it
  // never fights their panning.
  function frame(points: LngLat[]) {
    map?.fitBounds(bounds(points), { padding: panelPadding() });
  }

  function chooseMode(next: Mode) {
    if (next !== "zone") setDraft([]); // a half-drawn zone never outlives drawing mode
    setMode(next);
  }

  // Effect events: the map listeners below read the current mode and draft without re-registering.
  const placePoint = useEffectEvent((lngLat: MapLibreLngLat) => {
    // unproject does not wrap, so a click on a world copy can read lng ≈ 184 instead of −176.
    const { lng, lat } = lngLat.wrap();
    const point: LngLat = [lng, lat];
    if (mode === "zone") {
      setDraft((corners) => appendCorner(corners, point));
      return;
    }
    if (mode === "start") dispatch({ type: "setStart", point });
    if (mode === "end") dispatch({ type: "setEnd", point });
    chooseMode(null);
  });
  const cancelMode = useEffectEvent(() => chooseMode(null));
  const finishDrawing = useEffectEvent(() => finishZone());

  const armed = mode !== null;
  useEffect(() => {
    if (!map || !armed) return;
    const canvas = map.getCanvas();
    const onClick = (event: MapMouseEvent) => placePoint(event.lngLat);
    // Keyboard placement: arrow keys pan the focused map, Enter places at its centre.
    const onCanvasKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") placePoint(map.getCenter());
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      // Leave alone an Escape that a focused control already handled with preventDefault.
      if (event.key === "Escape" && !event.defaultPrevented) cancelMode();
    };
    const cursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    canvas.dataset.placing = "true"; // tells the map's click-to-fly to stand down
    map.on("click", onClick);
    canvas.addEventListener("keydown", onCanvasKeyDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      canvas.style.cursor = cursor;
      delete canvas.dataset.placing;
      map.off("click", onClick);
      canvas.removeEventListener("keydown", onCanvasKeyDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [map, armed]);

  const drawing = mode === "zone";
  useEffect(() => {
    if (!map || !drawing) return;
    const canvas = map.getCanvas();
    // Double-click finishes the zone, so it must not also zoom.
    const onDoubleClick = () => finishDrawing();
    map.doubleClickZoom.disable();
    map.on("dblclick", onDoubleClick);
    return () => {
      map.doubleClickZoom.enable();
      map.off("dblclick", onDoubleClick);
      // Finish zone unmounts with drawing mode; if it had focus, hand focus to the map.
      if (document.activeElement === document.body) canvas.focus();
    };
  }, [map, drawing]);

  // A draft with fewer than 3 corners is dropped without adding a zone.
  function finishZone() {
    if (draft.length >= 3) {
      zonesDrawn.current += 1;
      const n = zonesDrawn.current;
      dispatch({
        type: "addZone",
        zone: { id: `zone-${n}`, name: `No-go zone ${n}`, ring: draft },
      });
    }
    chooseMode(null);
  }

  function clearZones() {
    dispatch({ type: "clearZones" });
    setDraft([]);
  }

  // From lg up it can sit over the bottom centre, so it ends above the hide-panels toggle there.
  return (
    <MapPanel
      title="Route"
      className="absolute right-4 bottom-12 max-h-[max(16rem,calc(100svh-31rem))] w-72 max-w-[calc(100%-2rem)] overflow-y-auto text-sm lg:top-4 lg:right-80 lg:bottom-auto lg:max-h-[calc(100svh-6.5rem)]"
      bodyClassName="mt-2 flex flex-col gap-3"
    >
      <ToggleGroup
        aria-label="Mission type"
        variant="outline"
        size="sm"
        value={[mission]}
        // Pressing the pressed item empties the value; the mission stays as it is then.
        // Safe cast: the only values are the two items below.
        onValueChange={(value) => value[0] && chooseMission(value[0] as MissionType)}
      >
        <ToggleGroupItem value="walking">Walking</ToggleGroupItem>
        <ToggleGroupItem value="drive-walk">Drive + walk</ToggleGroupItem>
      </ToggleGroup>
      {driving && (
        <DriveControls
          sites={destinations}
          destination={destination}
          onDestination={chooseDestination}
          power={power}
          onPower={(next) => dispatch({ type: "setPower", power: next })}
          samplingMin={samplingMin}
          onSamplingMin={(minutes) => dispatch({ type: "setSampling", minutes })}
        />
      )}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <ToggleGroup
            aria-label="Place on map"
            variant="outline"
            size="sm"
            value={mode ? [mode] : []}
            // Safe cast: the only values are the three items below; [] means none is pressed.
            onValueChange={(value) => chooseMode((value[0] ?? null) as Mode)}
          >
            <ToggleGroupItem value="start">Set start</ToggleGroupItem>
            <ToggleGroupItem value="end">Set end</ToggleGroupItem>
            <ToggleGroupItem ref={drawZoneItem} value="zone">
              Draw no-go zone
            </ToggleGroupItem>
          </ToggleGroup>
          {drawing && (
            <Button size="sm" disabled={draft.length < 3} onClick={finishZone}>
              {draft.length < 3 ? `Finish zone (${draft.length}/3)` : "Finish zone"}
            </Button>
          )}
          <ClearZonesButton zones={zones} onClear={clearZones} focusAfterClear={drawZoneItem} />
        </div>
        {/* Always mounted, so screen readers announce the hint when it changes. */}
        <p aria-live="polite" className={mode ? "text-xs text-muted-foreground" : "sr-only"}>
          {mode && (
            <>
              {MODE_HINTS[mode]} <Kbd>Enter</Kbd> map centre <Kbd>Esc</Kbd> cancel
            </>
          )}
        </p>
      </div>
      {driving ? (
        <DriveWalkResult journey={journey} destination={destination} onFit={frame} />
      ) : (
        <RouteResult plan={walk.plan} loadFailed={walk.loadFailed} />
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs">
          No-go zones: {zones.length ? zones.map((zone) => zone.name).join(", ") : "none"}
        </p>
        <RouteLegend mode={mission} />
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="xs" />}
          className="[&[data-panel-open]>svg]:rotate-180"
        >
          Assumptions and data
          <ChevronDownIcon aria-hidden />
        </CollapsibleTrigger>
        <CollapsiblePanel className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground motion-reduce:transition-none">
          {driving ? (
            <DriveWalkAssumptions grid={journey.driveGrid} plan={journey.plan} />
          ) : (
            <WalkAssumptions plan={walk.plan} />
          )}
        </CollapsiblePanel>
      </Collapsible>
    </MapPanel>
  );
}

/** South-west and north-east corners around the points, the short way round across ±180°. */
function bounds(points: LngLat[]): [LngLat, LngLat] {
  const [firstLng] = points[0];
  // Shift each point by whole turns to within 180° of the first; MapLibre accepts longitudes past ±180.
  const lngs = points.map(([lng]) => lng + 360 * Math.round((firstLng - lng) / 360));
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// From lg up, the layer panel sits on the left and the scene and route panels on the right.
function panelPadding() {
  return window.matchMedia("(min-width: 64rem)").matches
    ? { top: 64, bottom: 64, left: 320, right: 640 }
    : { top: 64, bottom: 64, left: 32, right: 32 };
}
