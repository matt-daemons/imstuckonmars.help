import type { LngLat as MapLibreLngLat, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { draftFeatures, setData } from "@/components/map/route-layers";
import { appendCorner } from "@/lib/mars/route-zones";
import type { LngLat } from "@/lib/mars/types";

import { useRoutePlan } from "./route-plan-provider";

export type PlaceMode = "start" | "end" | "zone";

export type Placement = ReturnType<typeof usePlacement>;

/**
 * Placing the start or the end, or drawing a no-go zone, by clicking the map. Placing is transient,
 * so it is not in the route plan. The sidebar holds it rather than step 02, because below md the
 * step sits in a sheet that closes (and unmounts) while the operator clicks the map.
 */
export function usePlacement(map: MapLibreMap | null) {
  const { inputs, dispatch } = useRoutePlan();
  const [mode, setMode] = useState<PlaceMode | null>(null);
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [step, setStep] = useState(inputs.step);
  // The control that armed the placement, so Esc can hand focus back to it.
  const armedBy = useRef<HTMLElement | null>(null);

  useEffect(() => setData(map, "zone-draft", draftFeatures(draft)), [map, draft]);

  function choose(next: PlaceMode | null) {
    if (next !== "zone") setDraft([]); // a half-drawn zone never outlives drawing mode
    setMode(next);
  }

  /** Arms a placement from a control: focus moves to the map, where Enter places at its centre. */
  function arm(next: PlaceMode | null) {
    const canvas = map?.getCanvas();
    if (next && canvas && document.activeElement !== canvas) {
      armedBy.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      canvas.focus();
    }
    choose(next);
  }

  // Placing belongs to step 02, so any change of step cancels it: the sidebar's tabs, Back / Next,
  // or the verdict strip. Set during render, React's way to reset state when an input changes.
  if (step !== inputs.step) {
    setStep(inputs.step);
    choose(null);
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
    choose(null);
  });
  const cancel = useEffectEvent(() => {
    choose(null);
    // Back to the toggle that armed it; below md that sits in the closed sheet, so focus stays put.
    if (armedBy.current?.isConnected) armedBy.current.focus();
    armedBy.current = null;
  });
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
      if (event.key === "Escape" && !event.defaultPrevented) cancel();
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
    if (draft.length >= 3) dispatch({ type: "addZone", ring: draft });
    choose(null);
  }

  function clearZones() {
    dispatch({ type: "clearZones" });
    setDraft([]);
  }

  return { mode, draft, choose, arm, finishZone, clearZones };
}
