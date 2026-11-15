"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { HomebaseData } from "@/lib/homebase/types";
import { HOMEBASE } from "@/lib/homebase/context";
import { ReferencePanes } from "./reference-panes";

export function ReferenceInspector({
  open,
  onClose,
  data,
  base,
  generation,
  onExperiments,
}: {
  open: boolean;
  onClose: () => void;
  data: HomebaseData | null;
  base?: typeof HOMEBASE;
  generation: number;
  onExperiments: () => void;
}) {
  const [section, setSection] = useState("clock");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPopup
        className="hb-inspector-dialog"
        showCloseButton={false}
        bottomStickOnMobile={false}
      >
        <div className="homebase-dashboard hb-inspector-shell" data-loaded={!!data || undefined}>
          <header className="hb-header">
            <DialogTitle>Mission reference</DialogTitle>
            <Button variant="outline" onClick={onClose}>
              <X aria-hidden />
              Close
            </Button>
          </header>
          <DialogDescription className="hb-archive-bar">
            Historical sources and hypothetical map base, not live local readings.
          </DialogDescription>
          <nav className="hb-inspector-nav" aria-label="Reference panes">
            {["clock", "surface", "oxygen", "sources"].map((id) => (
              <Button
                key={id}
                variant="ghost"
                aria-pressed={id === section}
                onClick={() => setSection(id)}
              >
                {id[0].toUpperCase() + id.slice(1)}
              </Button>
            ))}
          </nav>
          <div className="hb-inspector-content">
            <ReferencePanes
              data={data}
              base={base}
              generation={generation}
              onExperiments={() => {
                onClose();
                onExperiments();
              }}
              section={section}
            />
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
