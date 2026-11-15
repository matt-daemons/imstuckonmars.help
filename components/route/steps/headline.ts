import type { ReadoutItem } from "@/components/map/route-result";

/**
 * Splits the readouts into the check step's headline numbers and the rest. The readout behind the
 * verdict (the one with a mark) always leads: if it is not in `headline`, it takes the last one's place.
 */
export function splitHeadline(readouts: ReadoutItem[], headline: string[]) {
  const limiting = readouts.find((readout) => readout.mark);
  const ids =
    limiting && !headline.includes(limiting.id)
      ? [...headline.slice(0, -1), limiting.id]
      : headline;
  return {
    headline: readouts.filter((readout) => ids.includes(readout.id)),
    details: readouts.filter((readout) => !ids.includes(readout.id)),
  };
}
