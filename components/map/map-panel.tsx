"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface MapPanelProps extends ComponentProps<"aside"> {
  title: string;
  defaultOpen?: boolean;
  /** Layout of the body, such as the spacing between its sections. */
  bodyClassName?: string;
}

/** A card over the map whose body collapses to its title row. */
export function MapPanel({
  title,
  className,
  bodyClassName,
  children,
  defaultOpen = true,
  ...rest
}: MapPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<aside {...rest} />}
      aria-labelledby={titleId}
      className={cn(
        "map-panel rounded-lg border bg-background/90 p-4 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="font-heading text-sm font-semibold">
          {title}
        </h2>
        <CollapsibleTrigger
          render={<Button size="icon-xs" variant="ghost" />}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
        >
          {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </CollapsibleTrigger>
      </div>
      {/* keepMounted keeps the body's state while collapsed. -m-1 p-1 leaves room for focus
          rings, which the panel's overflow-hidden would otherwise clip. */}
      <CollapsiblePanel
        keepMounted
        className={cn("-m-1 p-1 motion-reduce:transition-none", bodyClassName)}
      >
        {children}
      </CollapsiblePanel>
    </Collapsible>
  );
}
