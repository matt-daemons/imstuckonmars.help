import { ArrowUpIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import type { ReadoutItem } from "@/components/map/route-result";

import { splitHeadline } from "./headline";

const readout = (id: string, limiting = false): ReadoutItem => ({
  id,
  label: id,
  value: "1",
  mark: limiting ? { tone: "", label: "Above limit", Icon: ArrowUpIcon } : undefined,
});
const ids = (readouts: ReadoutItem[]) => readouts.map((item) => item.id);

describe("splitHeadline", () => {
  it("leads with the headline readouts, in their own order, and leaves the rest for details", () => {
    const split = splitHeadline(
      [readout("distance"), readout("time"), readout("slope"), readout("farthest")],
      ["slope", "time", "distance"],
    );
    expect(ids(split.headline)).toEqual(["distance", "time", "slope"]);
    expect(ids(split.details)).toEqual(["farthest"]);
  });

  it("keeps the headline when the limiting readout is already in it", () => {
    const split = splitHeadline(
      [readout("distance"), readout("time"), readout("slope", true), readout("farthest")],
      ["slope", "time", "distance"],
    );
    expect(ids(split.headline)).toEqual(["distance", "time", "slope"]);
  });

  it("swaps the limiting readout in for the last headline one", () => {
    const split = splitHeadline(
      [readout("distance"), readout("time"), readout("slope"), readout("farthest", true)],
      ["slope", "time", "distance"],
    );
    expect(ids(split.headline)).toEqual(["time", "slope", "farthest"]);
    expect(ids(split.details)).toEqual(["distance"]);
  });
});
