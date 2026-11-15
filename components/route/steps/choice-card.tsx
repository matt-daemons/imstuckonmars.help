import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/radio-group";

/** One option of a RadioGroup, drawn as a card: a title with one line under it. */
export function ChoiceCard({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    // Hover is a one-step surface change: --muted keeps the muted line at 6.2:1 (--accent: 4.9:1).
    <Label className="cursor-pointer items-start gap-3 border p-3 transition-colors duration-150 ease-out hover:bg-muted has-data-checked:border-primary motion-reduce:transition-none">
      <Radio value={value} className="mt-0.5" />
      <span className="flex flex-col gap-1">
        {title}
        <span className="font-sans text-xs font-normal text-muted-foreground">{children}</span>
      </span>
    </Label>
  );
}
