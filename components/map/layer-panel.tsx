"use client";

import { Switch } from "@/components/ui/switch";
import type { LayerManifest } from "@/lib/mars/types";

interface LayerPanelProps {
  manifest: LayerManifest;
  visible: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
}

export function LayerPanel({ manifest, visible, onToggle }: LayerPanelProps) {
  return (
    <aside className="absolute top-4 left-4 w-72 max-w-[calc(100%-2rem)] rounded-lg border bg-background/90 p-4 shadow-lg backdrop-blur">
      <h2 className="font-heading text-sm font-semibold">{manifest.aoi.name}</h2>
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
    </aside>
  );
}
