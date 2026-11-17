import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { ComponentProps } from "react";
import { DustPlayback } from "./dust-playback";

const buttons = vi.hoisted(() => new Map<string, () => void>());
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: ComponentProps<"button">) => {
    if (typeof children === "string" && onClick) buttons.set(children, () => onClick({} as never));
    return <button {...props}>{children}</button>;
  },
}));
vi.mock("@/components/route/route-plan-provider", () => ({
  useRoutePlan: () => ({ base: [-176.05, 45.97] }),
}));
vi.mock("@/components/route/conditions-provider", () => ({
  useConditions: () => ({ setSimulatedDust: vi.fn() }),
}));

describe("NASA dust loading camera", () => {
  it("does not move the camera when the operator requests simulation data", () => {
    const flyTo = vi.fn();
    const map = { flyTo } as unknown as MapLibreMap;
    const html = renderToStaticMarkup(<DustPlayback map={map} legendTarget={null} />);
    expect(html).toContain("Load NASA simulation");
    expect(buttons.has("Load NASA simulation")).toBe(true);
    buttons.get("Load NASA simulation")!();
    expect(flyTo).not.toHaveBeenCalled();
  });
});
