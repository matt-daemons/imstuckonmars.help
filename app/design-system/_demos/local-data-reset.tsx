"use client";

import { useState } from "react";
import { LocalDataResetDialog } from "@/components/debug/local-data-reset";
import { Button } from "@/components/ui/button";
import { Section } from "../_components/section";

export function LocalDataResetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Section id="local-data-reset" title="Local data reset" className="flex-col">
      <p>Confirmation fixture only. No browser data is deleted.</p>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Preview reset confirmation
      </Button>
      <LocalDataResetDialog
        open={open}
        onOpenChange={setOpen}
        resetting={false}
        error={null}
        onReset={() => setOpen(false)}
      />
    </Section>
  );
}
