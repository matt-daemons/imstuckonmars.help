"use client";

import { createContext, useContext, useEffect, type RefObject } from "react";

/**
 * Where the verdict strip renders: a flex item of the map's top row, beside the sidebar trigger
 * and the Mission dashboard button. Undefined outside the map (the strip then renders in place);
 * null until the row has mounted.
 */
export const MapTopRowSlot = createContext<HTMLElement | null | undefined>(undefined);

export function useMapTopRowSlot() {
  return useContext(MapTopRowSlot);
}

/**
 * The top row wraps the strip onto a second line when it does not fit between the left controls
 * and the camera stack. Its height goes to --map-top-row-height on the overlay column, so the
 * panels below (vitals, the mobile camera stack) start under it, and data-wrapped left-aligns
 * the strip on its own line.
 */
export function useTopRowHeight(
  row: RefObject<HTMLElement | null>,
  slot: HTMLElement | null,
  column: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const element = row.current;
    const target = column.current;
    if (!element || !target) return;
    const update = () => {
      target.style.setProperty("--map-top-row-height", `${element.offsetHeight}px`);
      const first = element.firstElementChild as HTMLElement | null;
      const wrapped = Boolean(
        slot && first && slot.offsetTop >= first.offsetTop + first.offsetHeight,
      );
      element.toggleAttribute("data-wrapped", wrapped);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (slot) observer.observe(slot);
    update();
    return () => observer.disconnect();
  }, [row, slot, column]);
}
