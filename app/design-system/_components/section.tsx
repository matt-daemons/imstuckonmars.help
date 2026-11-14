import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h3 id={`${id}-title`} className="mb-3 font-heading text-lg font-semibold">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h3>
      <div
        className={cn(
          "flex flex-wrap items-start gap-4 rounded-xl border bg-card p-6 text-card-foreground",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 border-b pb-2 font-heading text-2xl font-semibold">
      {children}
    </h2>
  );
}
