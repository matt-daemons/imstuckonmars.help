"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import type { LngLat } from "@/lib/mars/types";

import { MapPlacementHint } from "./placement-hint";
import type { Step } from "./route-plan";
import { useRoutePlan } from "./route-plan-provider";
import { RunStep } from "@/components/expedition/run-step";

import { CheckStep } from "./steps/check-step";
import { MissionStep } from "./steps/mission-step";
import { WhereStep } from "./steps/where-step";
import { usePlacement } from "./use-placement";

const STEPS: { step: Step; number: string; label: string }[] = [
  { step: "mission", number: "01", label: "Mission" },
  { step: "where", number: "02", label: "Where" },
  { step: "check", number: "03", label: "Check" },
  { step: "run", number: "04", label: "Run" },
];

// Back at the first step and Next at the last stay focusable (aria-disabled, not disabled): a
// disabled button under focus drops focus to <body>. Muted text with no fill reads as unavailable
// and still measures 6.9:1 (on outline's cyan tint it would be 4.8:1).
const UNAVAILABLE =
  "aria-disabled:pointer-events-none aria-disabled:text-muted-foreground dark:aria-disabled:bg-transparent";

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
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const placement = usePlacement(map);
  const index = STEPS.findIndex(({ step }) => step === inputs.step);
  const atFirst = index === 0;
  const atLast = index === STEPS.length - 1;

  // H shows or hides the sidebar, unless the operator is typing or using another shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== "h" && e.key !== "H") || e.repeat || hasModifier(e) || isTyping(e.target)) {
        return;
      }
      // Hiding the sidebar would strand focus on a control that is no longer visible, and the
      // browser drops it to <body>; the map is next on screen. Below md the sheet returns focus itself.
      const focusInSidebar = document.activeElement?.closest('[data-sidebar="sidebar"]');
      if (!isMobile && open && focusInSidebar) map?.getCanvas().focus();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, isMobile, open, map]);

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
            {/* Full muted foreground: coss's 72 % muted tabs measure 3.8:1 on the tab bar. */}
            <TabsList aria-label="Mission steps" className="w-full text-muted-foreground">
              {STEPS.map(({ step, number, label }) => (
                <TabsTab key={step} value={step}>
                  <span aria-hidden className="font-mono tabular-nums opacity-70">
                    {number}
                  </span>
                  {label}
                </TabsTab>
              ))}
            </TabsList>
          </SidebarHeader>
          {/* tabIndex -1: each step has its own controls, so a panel is no Tab stop of its own. Only
              step 03 is focused by code (the verdict strip finds it by data-step), so it alone draws
              a focus ring. */}
          <SidebarContent className="gap-4 p-4 text-sm">
            <TabsPanel value="mission" tabIndex={-1}>
              <MissionStep map={map} base={base} />
            </TabsPanel>
            <TabsPanel value="where" tabIndex={-1}>
              <WhereStep map={map} base={base} target={target} placement={placement} />
            </TabsPanel>
            <TabsPanel
              value="check"
              tabIndex={-1}
              data-step="check"
              // scroll-mt-4 keeps the ring, drawn 6 px outside the panel, clear of the scroller's top.
              className="scroll-mt-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-sidebar"
            >
              <CheckStep map={map} />
            </TabsPanel>
            <TabsPanel value="run" tabIndex={-1}>
              <RunStep />
            </TabsPanel>
            {children}
          </SidebarContent>
          {/* Pinned under the scrolling step, so Back and Next sit in the same place on every step. */}
          <SidebarFooter className="flex-row justify-between gap-2 border-t p-4">
            <Button
              variant="outline"
              aria-disabled={atFirst || undefined}
              className={UNAVAILABLE}
              onClick={() => !atFirst && goTo(STEPS[index - 1].step)}
            >
              <ArrowLeftIcon aria-hidden />
              Back
            </Button>
            <Button
              variant={atLast ? "outline" : "default"}
              aria-disabled={atLast || undefined}
              className={UNAVAILABLE}
              onClick={() => !atLast && goTo(STEPS[index + 1].step)}
            >
              Next
              <ArrowRightIcon aria-hidden />
            </Button>
          </SidebarFooter>
        </Tabs>
      </Sidebar>
      {isMobile && <MapPlacementHint placement={placement} shown={!openMobile} />}
    </>
  );
}
