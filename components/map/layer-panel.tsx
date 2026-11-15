"use client";

import { MapPanel } from "@/components/map/map-panel";
import { Switch } from "@/components/ui/switch";
import type { LayerManifest } from "@/lib/mars/types";

interface LayerPanelProps {
  manifest: LayerManifest;
  visible: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
}

export function LayerPanel({ manifest, visible, onToggle }: LayerPanelProps) {
  return (
    <MapPanel
      title={manifest.aoi.name}
      className="absolute top-4 left-4 w-72 max-w-[calc(100%-2rem)]"
    >
      <p className="mt-1 text-xs text-muted-foreground">{manifest.crs}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {manifest.layers.map((layer) => (
          <li key={layer.id} className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm">{layer.title}</p>
              <p className="text-xs text-muted-foreground">Source: {layer.source.name}</p>
            </div>
            <Switch
              checked={visible[layer.id] ?? false}
              onCheckedChange={(on) => onToggle(layer.id, on)}
              aria-label={`Toggle ${layer.title}`}
            />
          </li>
        ))}
      </ul>
      <a
        href="/sources"
        className="mt-3 block font-mono text-xs text-primary underline underline-offset-2"
      >
        Sources and caveats →
      </a>
    </MapPanel>
  );
}
