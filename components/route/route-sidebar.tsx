"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import type { LngLat } from "@/lib/mars/types";

import { MapPlacementHint } from "./placement-hint";
import type { Step } from "./route-plan";
import { useRoutePlan } from "./route-plan-provider";
import { CheckStep } from "./steps/check-step";
import { MissionStep } from "./steps/mission-step";
import { WhereStep } from "./steps/where-step";
import { usePlacement } from "./use-placement";

const STEPS: { step: Step; number: string; label: string }[] = [
  { step: "mission", number: "①", label: "Mission" },
  { step: "where", number: "②", label: "Where" },
  { step: "check", number: "③", label: "Check" },
];

const hasModifier = (e: KeyboardEvent) => e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.closest("input, textarea, select") !== null);

/**
 * The mission, one step at a time, docked left of the map. `children` sit under the steps. The
 * steps mount and unmount as the operator moves between them; the plan lives in RoutePlanProvider.
 */
export function RouteSidebar({
  map,
  base,
  target,
  children,
}: {
  map: MapLibreMap | null;
  base: LngLat;
  target: LngLat;
  children: ReactNode;
}) {
  const { inputs, dispatch } = useRoutePlan();
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const placement = usePlacement(map);
  const index = STEPS.findIndex(({ step }) => step === inputs.step);

  // H shows or hides the sidebar, unless the operator is typing or using another shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== "h" && e.key !== "H") || e.repeat || hasModifier(e) || isTyping(e.target)) {
        return;
      }
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const goTo = (step: Step) => dispatch({ type: "goTo", step });

  return (
    <>
      {/* invisible once slid away, so Tab cannot reach controls that are off screen */}
      <Sidebar className="transition-[left,right,width,visibility] group-data-[collapsible=offcanvas]:invisible">
        <Tabs
          value={inputs.step}
          // Safe cast: the only values are the step tabs below.
          onValueChange={(step) => goTo(step as Step)}
          className="min-h-0 flex-1 gap-0"
        >
          <SidebarHeader className="gap-3 border-b bg-secondary p-4">
            <h2 className="font-heading text-sm font-semibold">LARA · Arcadia base</h2>
            <TabsList aria-label="Mission steps" className="w-full">
              {STEPS.map(({ step, number, label }) => (
                <TabsTab key={step} value={step}>
                  <span aria-hidden>{number}</span>
                  {label}
                </TabsTab>
              ))}
            </TabsList>
          </SidebarHeader>
          <SidebarContent className="gap-4 p-4 text-sm">
            <TabsPanel value="mission">
              <MissionStep map={map} base={base} target={target} />
            </TabsPanel>
            <TabsPanel value="where">
              <WhereStep map={map} base={base} target={target} placement={placement} />
            </TabsPanel>
            <TabsPanel value="check">
              <CheckStep map={map} />
            </TabsPanel>
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => goTo(STEPS[index - 1].step)}
              >
                <ArrowLeftIcon aria-hidden />
                Back
              </Button>
              <Button
                disabled={index === STEPS.length - 1}
                onClick={() => goTo(STEPS[index + 1].step)}
              >
                Next
                <ArrowRightIcon aria-hidden />
              </Button>
            </div>
            {children}
          </SidebarContent>
        </Tabs>
      </Sidebar>
      {isMobile && <MapPlacementHint placement={placement} shown={!openMobile} />}
    </>
  );
}
