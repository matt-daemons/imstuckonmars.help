"use client";

import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { MapDisclosure } from "./map-disclosure";

export function LayersPanel({
  children,
  fakeData = false,
}: {
  children: ReactNode;
  fakeData?: boolean;
}) {
  return (
    <div className="map-layers-control">
      <MapDisclosure title="Layers" icon={Layers}>
        {fakeData && (
          <p className="border-b px-2 py-2 text-sm">Fake data mode · fictional sensor fields</p>
        )}
        <div className="map-layers-content p-2">{children}</div>
      </MapDisclosure>
    </div>
  );
}
