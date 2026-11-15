"use client";

import { useState, type RefObject } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { NoGoZone } from "@/lib/mars/routing";

/** Clearing zones can turn a NO-GO into a GO, so it asks first. */
export function ClearZonesButton({
  zones,
  onClear,
  focusAfterClear,
}: {
  zones: NoGoZone[];
  onClear: () => void;
  focusAfterClear: RefObject<HTMLElement | null>;
}) {
  // The zones as they were when the dialog opened, so its copy holds still while it closes.
  const [zonesAtOpen, setZonesAtOpen] = useState<NoGoZone[]>([]);
  const count = zonesAtOpen.length;
  return (
    <AlertDialog onOpenChange={(open) => open && setZonesAtOpen(zones)}>
      <AlertDialogTrigger
        disabled={zones.length === 0}
        render={<Button size="sm" variant="destructive-outline" />}
      >
        Clear zones
      </AlertDialogTrigger>
      {/* After clearing, the trigger is disabled and cannot take focus back. */}
      <AlertDialogPopup data-hazard finalFocus={() => zones.length > 0 || focusAfterClear.current}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Clear {count} no-go {count === 1 ? "zone" : "zones"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? "Routes will no longer avoid it." : "Routes will no longer avoid them."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />} onClick={onClear}>
            Clear zones
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
