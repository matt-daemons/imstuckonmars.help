"use client";

import { Layers, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** A nonmodal disclosure: hidden content stays mounted to preserve playback and selections. */
export function LayersPanel({
  children,
  fakeData = false,
}: {
  children: ReactNode;
  fakeData?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]'))
        return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  return (
    <div ref={root} className="map-layers-control" data-open={open || undefined}>
      <Button
        ref={trigger}
        variant="outline"
        className="map-layers-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Layers aria-hidden />
        Layers
      </Button>
      <aside id={id} aria-label="Layers" hidden={!open} className="map-layers-panel">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="font-heading">Layers</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close layers"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <X aria-hidden />
          </Button>
        </header>
        {fakeData && (
          <p className="sticky top-0 z-1 border-b bg-background px-4 py-2 text-sm">
            Fake data mode · fictional sensor fields
          </p>
        )}
        <div className="map-layers-content p-4">{children}</div>
      </aside>
    </div>
  );
}
