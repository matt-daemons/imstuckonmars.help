"use client";

import { spaceWeatherLine } from "../conditions";
import { useConditions } from "../conditions-provider";

/** Step 03's line on the solar alert's feed: its level, source and when it was read. */
export function SpaceWeatherLine() {
  const { spaceWeather } = useConditions();
  return <p className="text-xs text-muted-foreground">{spaceWeatherLine(spaceWeather)}</p>;
}
