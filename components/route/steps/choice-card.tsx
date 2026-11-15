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
    <Label className="items-start gap-3 border p-3 has-data-checked:border-primary">
      <Radio value={value} className="mt-0.5" />
      <span className="flex flex-col gap-1">
        {title}
        <span className="font-sans text-xs font-normal text-muted-foreground">{children}</span>
      </span>
    </Label>
  );
}
