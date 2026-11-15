"use client";

import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import "./map-disclosure.css";

/** Native disclosure keeps layer state mounted and shares keyboard behavior across map controls. */
export function MapDisclosure({
  title,
  icon: Icon,
  children,
  detailsRef,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  detailsRef?: RefObject<HTMLDetailsElement | null>;
}) {
  const localRef = useRef<HTMLDetailsElement>(null);
  const ref = detailsRef ?? localRef;
  return (
    <details
      ref={ref}
      className="map-disclosure"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !ref.current?.open) return;
        if (
          event.target instanceof Element &&
          event.target.closest('[role="dialog"], [role="alertdialog"]')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }}
    >
      <summary>
        <Icon aria-hidden />
        <span>{title}</span>
        <ChevronDownIcon aria-hidden className="map-disclosure-chevron" />
      </summary>
      <div className="map-disclosure-content">{children}</div>
    </details>
  );
}
