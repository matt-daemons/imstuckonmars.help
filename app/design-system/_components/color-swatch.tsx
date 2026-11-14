"use client";

import { useEffect, useRef, useState } from "react";

export function ColorSwatch({ token }: { token: string }) {
  const swatch = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState("");

  useEffect(() => {
    if (swatch.current) {
      setResolved(getComputedStyle(swatch.current).backgroundColor);
    }
  }, []);

  return (
    <div className="flex w-40 flex-col gap-1.5">
      <div
        ref={swatch}
        className="h-14 rounded-lg border"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <code className="font-mono text-xs">--{token}</code>
      <span className="truncate font-mono text-[0.7rem] text-muted-foreground" title={resolved}>
        {resolved}
      </span>
    </div>
  );
}
