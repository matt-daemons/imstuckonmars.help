"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";

import {
  setGeologyVisible,
  setRegionalSlopeVisible,
  setRoughnessVisible,
  setThermalInertiaVisible,
} from "@/components/map/scene";
import { useRoutePlan } from "@/components/route/route-plan-provider";
import { Switch } from "@/components/ui/switch";
import {
  GEOLOGY_ATTRIBUTION,
  GEOLOGY_BOUNDS,
  GEOLOGY_LEGEND,
  type GeologySummary,
  type LegendClass,
  REGIONAL_SLOPE_ATTRIBUTION,
  REGIONAL_SLOPE_LEGEND,
  ROUGHNESS_ATTRIBUTION,
  ROUGHNESS_LEGEND,
  type RoughnessSummary,
  THERMAL_INERTIA_ATTRIBUTION,
  THERMAL_INERTIA_LEGEND,
  type ThermalInertiaSummary,
  geologyFor,
  thermalInertiaFor,
} from "@/lib/mars/ground-layers";

interface GroundOverlaysProps {
  map: MapLibreMap | null;
  sites: { id: string; title: string }[];
}

function Legend({ classes, note }: { classes: LegendClass[]; note: string }) {
  return (
    <div className="space-y-1 pl-1 text-xs">
      <ul className="space-y-0.5">
        {classes.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 shrink-0 border"
              style={c.color ? { backgroundColor: c.color } : undefined}
            />
            <span className="font-mono">{c.range}</span>
            <span className="text-muted-foreground">{c.label}</span>
          </li>
        ))}
      </ul>
      <p className="font-medium text-warning-foreground">{note}</p>
    </div>
  );
}

/** Thermal-inertia, roughness and geology switches, with legends and the uncertainty behind each value. */
export function GroundOverlays({ map, sites }: GroundOverlaysProps) {
  const [tiOn, setTiOn] = useState(false);
  const [roughOn, setRoughOn] = useState(false);
  const [ti, setTi] = useState<ThermalInertiaSummary | null>(null);
  const [rough, setRough] = useState<RoughnessSummary | null>(null);
  const [slopeOn, setSlopeOn] = useState(false);
  const [geoOn, setGeoOn] = useState(false);
  const [geo, setGeo] = useState<GeologySummary | null>(null);

  useEffect(() => {
    const load = <T,>(name: string, set: (v: T) => void) =>
      fetch(`/data/processed/${name}`)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .then((v) => v && set(v))
        .catch(() => undefined);
    load("thermal-inertia-sites.json", setTi);
    load("roughness-sites.json", setRough);
    load("geology-sites.json", setGeo);
  }, []);

  useEffect(() => {
    if (map) setThermalInertiaVisible(map, tiOn);
  }, [map, tiOn]);

  useEffect(() => {
    if (map) setRegionalSlopeVisible(map, slopeOn);
  }, [map, slopeOn]);

  useEffect(() => {
    if (map) setRoughnessVisible(map, sites, roughOn);
  }, [map, sites, roughOn]);

  useEffect(() => {
    if (map) setGeologyVisible(map, geoOn);
  }, [map, geoOn]);

  // Show the whole corridor when geology is switched on, unless the operator is planning a mission.
  const planning = useRoutePlan().inputs.mission !== null;
  function toggleGeology(on: boolean) {
    setGeoOn(on);
    if (on && map && !planning)
      map.fitBounds(GEOLOGY_BOUNDS, { padding: 60, pitch: 0, duration: 2000 });
  }

  const tiRows = [{ id: "habitat", title: "Habitat" }, ...sites].flatMap((s) => {
    const row = ti && thermalInertiaFor(ti, s.id);
    return row ? [{ ...row, title: s.title }] : [];
  });

  const geoRows = [{ id: "habitat", title: "Habitat" }, ...sites].flatMap((s) => {
    const row = geo && geologyFor(geo, s.id);
    return row ? [{ ...row, title: s.title }] : [];
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="flex items-center justify-between gap-3">
          <span>
            Thermal inertia
            <span className="block text-xs text-muted-foreground">
              THEMIS 100 m · {THERMAL_INERTIA_ATTRIBUTION}
            </span>
          </span>
          <Switch checked={tiOn} onCheckedChange={setTiOn} aria-label="Toggle thermal inertia" />
        </label>
        {tiOn && (
          <>
            <Legend classes={THERMAL_INERTIA_LEGEND} note="Indicative, ±20 %" />
            <p className="text-xs">
              THEMIS covers ~{ti?.coverage.aoi_percent ?? 57} % of the area; blank = no data, not
              safe ground.
            </p>
            {tiRows.length > 0 && (
              <ul className="space-y-0.5 text-xs">
                {tiRows.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.title}</span>:{" "}
                    <span className="font-mono">
                      {r.mean} ({r.mean_range[0]}–{r.mean_range[1]})
                    </span>{" "}
                    {r.class}
                    {!r.class_robust && (
                      <span className="ml-1 border border-warning px-1 text-warning-foreground">
                        not robust
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {ti && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Caveats</summary>
                <ul className="list-disc space-y-0.5 pt-1 pl-4">
                  {ti.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                  <li>
                    Means within 5 km; range = mean ±20 %. Not robust = range crosses a class.
                  </li>
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      <div className="space-y-1">
        <label className="flex items-center justify-between gap-3">
          <span>
            Roughness (walking)
            <span className="block text-xs text-muted-foreground">
              5 m cells from 1 m DTM · {ROUGHNESS_ATTRIBUTION}
            </span>
          </span>
          <Switch checked={roughOn} onCheckedChange={setRoughOn} aria-label="Toggle roughness" />
        </label>
        {roughOn && (
          <>
            <Legend classes={ROUGHNESS_LEGEND} note="Team assumption — NASA has no limit" />
            <p className="text-xs">
              Mostly DTM noise: only crater rims and ridge flanks stand out. Boulders are too small
              for the DTM.
            </p>
            {rough && (
              <ul className="space-y-0.5 text-xs">
                {sites.map((s) => {
                  const r = rough.sites[s.id];
                  return r ? (
                    <li key={s.id}>
                      <span className="font-medium">{s.title}</span>: median{" "}
                      <span className="font-mono">{r.p50_m.toFixed(2)} m</span>, 90 %{" "}
                      <span className="font-mono">{r.p90_m.toFixed(2)} m</span>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {rough && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Caveats</summary>
                <p className="pt-1">{rough.note}</p>
              </details>
            )}
          </>
        )}
      </div>

      <div className="space-y-1">
        <label className="flex items-center justify-between gap-3">
          <span>
            Regional slope
            <span className="block text-xs text-muted-foreground">
              MOLA/HRSC 200 m · {REGIONAL_SLOPE_ATTRIBUTION}
            </span>
          </span>
          <Switch
            checked={slopeOn}
            onCheckedChange={setSlopeOn}
            aria-label="Toggle regional slope"
          />
        </label>
        {slopeOn && (
          <>
            <Legend
              classes={REGIONAL_SLOPE_LEGEND}
              note="Drive corridor only; 200 m cells smooth out local hazards"
            />
            <p className="text-xs">
              Display only for now: the router still uses the 463 m MOLA grid.
            </p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <label className="flex items-center justify-between gap-3">
          <span>
            Geology
            <span className="block text-xs text-muted-foreground">
              USGS 1:20M · {GEOLOGY_ATTRIBUTION}
            </span>
          </span>
          <Switch checked={geoOn} onCheckedChange={toggleGeology} aria-label="Toggle geology" />
        </label>
        {geoOn && (
          <>
            <Legend classes={GEOLOGY_LEGEND} note="Regional context: contacts are kilometres off" />
            <p className="text-xs">
              Covers the drive corridor only. The ice-rich mantle at the sites is too thin for this
              map; the units are what lies beneath it.
            </p>
            {geoRows.length > 0 && (
              <ul className="space-y-0.5 text-xs">
                {geoRows.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.title}</span>:{" "}
                    <span className="font-mono">{r.unit}</span> {r.unit_name}, nearest contact{" "}
                    <span className="font-mono">{Math.round(r.nearest_contact_km)} km</span>
                  </li>
                ))}
              </ul>
            )}
            {geo && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Caveats</summary>
                <ul className="list-disc space-y-0.5 pt-1 pl-4">
                  {geo.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                  <li>Map colours are LARA&apos;s own, not the USGS map&apos;s.</li>
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
