"use client";

import type { ReactNode } from "react";
import "./listening-effect.css";

/** Keeps the listening light on the control, never on the surrounding map or chat. */
export function ListeningEffect({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className="lara-listening-control" data-listening={active || undefined}>
      {active && <span className="lara-listening-light" aria-hidden="true" />}
      {children}
    </span>
  );
}
