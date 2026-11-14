"use client";

import { useEffect, useRef, useState } from "react";

export function ColorSwatch({ token }: { token: string }) {
  const swatch = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState("");

  useEffect(() => {
    const element = swatch.current;
    if (!element) return;

    const read = () => setResolved(getComputedStyle(element).backgroundColor);
    read();

    // Re-read when the theme class on <html> changes.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
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
