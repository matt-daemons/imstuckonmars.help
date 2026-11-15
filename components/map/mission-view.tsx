"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  ArrowDownRightIcon,
  CompassIcon,
  CrosshairIcon,
  HomeIcon,
  MapIcon,
  RouteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExpedition } from "@/components/expedition/expedition-provider";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import {
  fitPoints,
  focusHomebase,
  focusTarget,
  prefersReducedMotion,
} from "@/components/route/camera";
import type { LngLat } from "@/lib/mars/types";
import type { Activity } from "@/lib/mission/types";
import "./mission-view.css";
import { selectedRoute } from "@/components/route/selected-route";
import { watchImageryLoading } from "./imagery-loading";
import { MapDisclosure } from "./map-disclosure";

type CameraView = "overview" | "homebase" | "route" | "crew" | "target";
export type InspectedLeg = Extract<Activity, "travel" | "science" | "return">;
interface MissionView {
  tilesLoading: boolean;
  inspectedLeg: InspectedLeg | null;
  inspectLeg: (leg: InspectedLeg | null) => void;
  focus: (view: CameraView) => boolean;
}
const MissionViewContext = createContext<MissionView | null>(null);

/** Presentation only. The expedition provider retains the mission clock and all commands. */
export function MissionViewProvider({
  map,
  base,
  error,
  children,
}: {
  map: MapLibreMap | null;
  base: LngLat;
  error: string | null;
  children: ReactNode;
}) {
  const expedition = useExpedition();
  const { inputs, walk, journey, destinations } = useRoutePlan();
  const [inspectedLeg, inspectLeg] = useState<InspectedLeg | null>(null);
  const positioned = useRef<MapLibreMap | null>(null);
  const { walk: selectedWalk, trip: selectedTrip } = selectedRoute(inputs, { walk, journey });
  const route = expedition.snapshot?.config.route;
  const [tilesLoading, setTilesLoading] = useState(false);
  useEffect(() => {
    if (!map) return;
    setTilesLoading(false);
    return watchImageryLoading(map, setTilesLoading);
  }, [map]);

  const focus = useCallback(
    (view: CameraView) => {
      if (!map) return false;
      map.stop();
      expedition.setFollow(view === "crew");
      if (view === "overview") {
        fitPoints(map, [base, ...destinations.map((site) => site.center)], {
          pitch: 0,
          maxZoom: 8,
        });
      } else if (view === "homebase") focusHomebase(map, base);
      else if (view === "target" && inputs.end) focusTarget(map, inputs.end);
      else if (view === "crew" && expedition.snapshot?.state.position) {
        map.flyTo({
          center: expedition.snapshot.state.position.lnglat,
          zoom: 16,
          pitch: 50,
          duration: prefersReducedMotion() ? 0 : 1200,
        });
      } else if (view === "route") {
        const points =
          inputs.step === "run" && route
            ? [route.shelter_lnglat, ...route.legs.flatMap((leg) => leg.path)]
            : inputs.mission === "walking" && selectedWalk
              ? [...selectedWalk.outbound.path, ...selectedWalk.back.path]
              : (selectedTrip?.collection?.features.flatMap((feature) =>
                  feature.geometry.type === "LineString"
                    ? feature.geometry.coordinates
                    : [feature.geometry.coordinates],
                ) ?? []);
        if (!points.length && !route) return false;
        fitPoints(
          map,
          points.length || !route
            ? points
            : [route.shelter_lnglat, ...route.legs.flatMap((leg) => leg.path)],
        );
      } else return false;
      return true;
    },
    [
      map,
      base,
      inputs,
      destinations,
      selectedWalk,
      selectedTrip,
      route,
      expedition.snapshot,
      expedition.setFollow,
    ],
  );

  useEffect(() => {
    if (!map || positioned.current === map) return;
    positioned.current = map;
    if (!route) focusHomebase(map, base, 0);
  }, [map, route, base]);

  useEffect(() => inspectLeg(null), [inputs.mission, inputs.end, inputs.route, inputs.samplingMin]);

  return (
    <MissionViewContext
      value={{
        tilesLoading: tilesLoading && !error,
        inspectedLeg,
        inspectLeg,
        focus,
      }}
    >
      <div className="mission-workspace" aria-label="Mission workspace">
        {children}
      </div>
    </MissionViewContext>
  );
}

export function useMissionView() {
  const value = useContext(MissionViewContext);
  if (!value) throw new Error("useMissionView needs MissionViewProvider");
  return value;
}

export function MapViewControls() {
  const { focus, tilesLoading } = useMissionView();
  const { inputs } = useRoutePlan();
  const { snapshot, follow, finished, setFollow } = useExpedition();
  return (
    <CameraViewMenu
      loading={tilesLoading}
      following={follow && !finished}
      canFollow={Boolean(snapshot?.config.route) && !finished}
      canViewRoute={Boolean(inputs.end || snapshot?.config.route)}
      canViewTarget={Boolean(inputs.end)}
      onSelect={(view) => {
        if (view === "crew" && follow) setFollow(false);
        else focus(view);
      }}
    />
  );
}

export function CameraViewMenu({
  loading = false,
  onSelect,
  following,
  canFollow,
  canViewRoute,
  canViewTarget,
}: {
  loading?: boolean;
  onSelect: (view: CameraView) => void;
  following: boolean;
  canFollow: boolean;
  canViewRoute: boolean;
  canViewTarget: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const choose = (view: CameraView) => {
    onSelect(view);
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  };
  return (
    <nav className="map-view-controls" aria-label="Camera views">
      <MapDisclosure title="Camera views" icon={CompassIcon} detailsRef={menu}>
        <div className="flex flex-col gap-1">
          <Button variant="outline" onClick={() => choose("overview")}>
            <MapIcon aria-hidden />
            Overview
          </Button>
          <Button variant="outline" onClick={() => choose("homebase")}>
            <HomeIcon aria-hidden />
            Homebase
          </Button>
          <Button variant="outline" disabled={!canViewRoute} onClick={() => choose("route")}>
            <RouteIcon aria-hidden />
            Route
          </Button>
          <Button variant="outline" disabled={!canViewTarget} onClick={() => choose("target")}>
            <ArrowDownRightIcon aria-hidden />
            Inspect target
          </Button>
          <Button
            variant="outline"
            aria-pressed={following}
            disabled={!canFollow}
            onClick={() => choose("crew")}
          >
            <CrosshairIcon aria-hidden />
            Follow crew
          </Button>
        </div>
      </MapDisclosure>
      {loading && (
        <p className="map-loading-status" role="status">
          Loading map imagery…
        </p>
      )}
    </nav>
  );
}
