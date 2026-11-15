import type { ReactNode } from "react";

import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * The map's own controls, under the mission steps and closed by default. They stay mounted while
 * closed: dust playback and the scene controls hold state and drive map layers.
 */
export function SidebarSections({ layers, scene }: { layers: ReactNode; scene: ReactNode }) {
  return (
    <Accordion multiple className="border-t">
      <AccordionItem value="layers">
        <AccordionTrigger>Map layers</AccordionTrigger>
        <AccordionPanel keepMounted className="text-foreground">
          {layers}
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="scene">
        <AccordionTrigger>Scene and dust</AccordionTrigger>
        <AccordionPanel keepMounted className="text-foreground">
          {scene}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
