import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { FLIGHT_RULES } from "@/lib/flight-rules/rules";
import {
  EVIDENCE_LABEL,
  type EvidenceKind,
  SOURCE_GROUPS,
  type SourceEntry,
} from "@/lib/mars/sources";

export const metadata: Metadata = {
  title: "Sources and caveats · LARA",
  description:
    "Sources, generators and limits for LARA's NASA data, simulations and fictional sensor layers.",
};

const BADGE: Record<
  EvidenceKind,
  "success" | "info" | "secondary" | "warning" | "outline" | "error"
> = {
  observation: "success",
  derived: "info",
  model: "secondary",
  simulated: "warning",
  illustration: "outline",
  ai: "error",
  placeholder: "error",
};

const RULE_NAMES: Record<keyof typeof FLIGHT_RULES, string> = {
  slope: "Slope",
  walk_back: "Walk-back distance",
  suit_supply: "Suit supply",
  radiation: "Solar events",
  dose_rate: "Dose rate",
  dust: "Dust opacity",
  daylight: "Daylight",
};

function Entry({ e }: { e: SourceEntry }) {
  return (
    <article className="grid gap-3 border-t border-border/40 py-4 md:grid-cols-[18rem_1fr] md:gap-6">
      <div className="min-w-0 space-y-1.5">
        <Badge variant={BADGE[e.kind]}>{EVIDENCE_LABEL[e.kind]}</Badge>
        <h3 className="font-heading text-base font-semibold">{e.title}</h3>
        <p className="font-mono text-xs text-primary">{e.credit}</p>
        {e.detail && <p className="text-xs break-words text-muted-foreground">{e.detail}</p>}
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p>{e.use}</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground marker:text-warning">
          {e.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {e.citations && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {e.citations.map((c) => (
              <li key={c} className="italic">
                {c}
              </li>
            ))}
          </ul>
        )}
        {e.links && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {e.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {l.label} ↗
              </a>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

export default function SourcesPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 md:py-12">
      <header className="space-y-3">
        <a href="/" className="font-mono text-xs text-primary underline underline-offset-2">
          ← Back to the map
        </a>
        <h1 className="font-heading text-3xl font-bold">Sources and caveats</h1>
        <p className="max-w-[68ch] text-muted-foreground">
          Every layer and reading in LARA, who measured or generated it, and what it can't tell you.
          NASA terrain and observations are evidence for planning, not a guarantee of safety on the
          ground.
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Evidence types">
          {(Object.keys(EVIDENCE_LABEL) as EvidenceKind[]).map((k) => (
            <li key={k}>
              <Badge variant={BADGE[k]}>{EVIDENCE_LABEL[k]}</Badge>
            </li>
          ))}
        </ul>
      </header>

      {SOURCE_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="space-y-2">
          <h2 id={`g-${g.id}`} className="font-heading text-xl font-semibold">
            {g.title}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted-foreground">{g.intro}</p>
          <div className="border-b border-border/40">
            {g.entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="g-rules" className="space-y-2">
        <h2 id="g-rules" className="font-heading text-xl font-semibold">
          Flight rules
        </h2>
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          NASA has published no walking, suit or weather limits for Mars. Moon and ISS limits are
          carried over as assumptions, and some limits are the team&apos;s own choice.
        </p>
        <div className="border-b border-border/40">
          {(Object.keys(FLIGHT_RULES) as (keyof typeof FLIGHT_RULES)[]).map((k) => {
            const rule = FLIGHT_RULES[k];
            const own = rule.applies_to === "assumption";
            return (
              <article
                key={k}
                className="grid gap-3 border-t border-border/40 py-4 md:grid-cols-[18rem_1fr] md:gap-6"
              >
                <div className="min-w-0 space-y-1.5">
                  <Badge variant={own ? "warning" : "info"}>
                    {own ? "Team assumption" : `From ${rule.applies_to}`}
                  </Badge>
                  <h3 className="font-heading text-base font-semibold">{RULE_NAMES[k]}</h3>
                </div>
                <p className="min-w-0 text-sm text-muted-foreground">{rule.source}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border/40 pt-4 text-xs text-muted-foreground">
        Full reference list: CLAUDE.md §10 in the project repository.
      </footer>
    </main>
  );
}
