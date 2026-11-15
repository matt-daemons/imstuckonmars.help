import { Spinner } from "@/components/ui/spinner";

/** Parent live regions own announcements, so the spinner stays decorative. */
export function RouteCalculationProgress() {
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <Spinner
        aria-hidden="true"
        role="presentation"
        className="size-4 shrink-0 motion-reduce:animate-none"
      />
      <span>Calculating route…</span>
    </span>
  );
}
