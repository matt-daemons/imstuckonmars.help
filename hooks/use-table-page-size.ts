"use client";

import { useEffect, useRef, useState } from "react";

/** Fit complete table rows into the space left by the fixed-screen console. */
export function useTablePageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(5);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const heading = container.querySelector("thead")?.getBoundingClientRect().height ?? 40;
      const row = container.querySelector("tbody tr")?.getBoundingClientRect().height ?? 40;
      setSize(Math.max(1, Math.floor((container.clientHeight - heading - 2) / Math.max(row, 40))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}
