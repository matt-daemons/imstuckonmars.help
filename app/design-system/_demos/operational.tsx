import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  SirenIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Section } from "../_components/section";

// Every demo here follows .agents/skills/operational-ui-standards/SKILL.md and the
// "UI standards" deviations in AGENTS.md. Rule IDs refer to that skill.

const lookalikeTest = "Il1 O0 S5 B8";

const typefaces = [
  {
    label: "Atkinson Hyperlegible Next",
    token: "--font-sans",
    className: "font-sans",
    pass: true,
    note: "Every pair is distinct: serifed I, tailed l, slashed 0. Running text.",
  },
  {
    label: "IBM Plex Sans Condensed",
    token: "--font-heading",
    className: "font-heading",
    pass: true,
    note: "Serifed I and tailed l. O and 0 differ by width only, so titles and labels never hold IDs or values.",
  },
  {
    label: "JetBrains Mono",
    token: "--font-mono",
    className: "font-mono",
    pass: true,
    note: "Every pair is distinct. Use for every ID, value, and number.",
  },
];

// Assumes 600 mm viewing distance, 96 dpi, and a cap height of 0.7 em.
const viewingDistanceMm = 600;
const mmPerPx = 25.4 / 96;
const textSizes = [
  { className: "text-xs", px: 12 },
  { className: "text-sm", px: 14 },
  { className: "text-base", px: 16 },
  { className: "text-lg", px: 18 },
  { className: "text-xl", px: 20 },
];

function capHeight(px: number) {
  const mm = px * 0.7 * mmPerPx;
  const degrees = (2 * Math.atan(mm / 2 / viewingDistanceMm) * 180) / Math.PI;
  return { mm, degrees };
}

const numberFormats = [
  { bad: ".5", good: "0.5 bar", rule: "D-5 leading zero, D-4 unit" },
  { bad: "-3.1415926 V", good: "−3.1 V", rule: "D-5 decimals match the column, true minus" },
  { bad: "12500m", good: "12,500 m", rule: "D-5 separator at five or more digits" },
  { bad: "1,190 kg", good: "1190 kg", rule: "D-5 no separator below five digits" },
  { bad: "+21.0 °C", good: "21.0 °C", rule: "D-5 plus sign only where sign matters" },
];

const messages = [
  {
    bad: "Error 0x3F",
    good: "Route not saved: segment 3 crosses a no-go zone. Edit segment 3, then save again.",
  },
  {
    bad: "Invalid input",
    good: 'Start time must be hh:mm:ss (24-hour). You entered "9:5".',
  },
  {
    bad: "Something went wrong",
    good: "Forecast not loaded: weather service timed out after 30 s. Showing forecast from 14:02 (stale). Retry.",
  },
];

const alertLevels = [
  { level: "Emergency", skill: "Emergency", Icon: SirenIcon, className: "text-destructive" },
  { level: "Error", skill: "Warning", Icon: CircleXIcon, className: "text-destructive" },
  { level: "Warning", skill: "Caution", Icon: TriangleAlertIcon, className: "text-warning" },
  { level: "Info", skill: "Advisory", Icon: InfoIcon, className: "text-info" },
];

const colorTable = [
  { token: "destructive", meaning: "Emergency and Error alerts, destructive actions" },
  { token: "warning", meaning: "Warning alerts (a note), out-of-limit caution, field overflow" },
  { token: "info", meaning: "Info alerts (advisory). Also the chrome accent" },
  { token: "success", meaning: "Success only" },
  { token: "hazard", meaning: "Hazard tape on confirmations of dangerous actions" },
];

function Verdict({ pass, children }: { pass: boolean; children?: ReactNode }) {
  return (
    <Badge variant={pass ? "success" : "error"}>
      {pass ? <CircleCheckIcon aria-hidden /> : <CircleXIcon aria-hidden />}
      {children ?? (pass ? "Pass" : "Fail")}
    </Badge>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-48 flex-col gap-1">
      <span className="font-heading text-sm text-muted-foreground">{label}</span>
      <div className="flex min-h-7 items-center gap-1.5">{children}</div>
    </div>
  );
}

export function Operational() {
  return (
    <>
      <Section id="lookalike-characters" title="Lookalike characters" className="flex-col">
        <p className="text-sm text-muted-foreground">
          T-1: each typeface renders the test string{" "}
          <code className="font-mono">{lookalikeTest}</code>. A font passes only when every pair is
          distinct.
        </p>
        {typefaces.map((face) => (
          <div key={face.token} className="flex flex-wrap items-center gap-4">
            <span className={`w-64 text-3xl ${face.className}`}>{lookalikeTest}</span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-heading">{face.label}</span>
                <code className="font-mono text-sm text-muted-foreground">{face.token}</code>
                <Verdict pass={face.pass} />
              </div>
              <span className="text-sm text-muted-foreground">{face.note}</span>
            </div>
          </div>
        ))}
      </Section>

      <Section id="typeface-roles" title="Typeface roles" className="flex-col">
        <p className="text-sm text-muted-foreground">
          T-2: monospace for numeric and tabular data, proportional for running text.
        </p>
        <div className="flex flex-wrap gap-8">
          <Readout label="Hab pressure">
            <span className="font-mono text-lg">101.3 kPa</span>
          </Readout>
          <Readout label="O₂ partial pressure">
            <span className="font-mono text-lg">21.2 kPa</span>
          </Readout>
          <Readout label="Rover ID">
            <span className="font-mono text-lg">RVR-01</span>
          </Readout>
        </div>
        <p className="max-w-prose">
          Procedure text reads in Atkinson Hyperlegible Next: check the suit seals, then open the
          inner airlock door.
        </p>
      </Section>

      <Section id="text-size" title="Text size" className="flex-col">
        <p className="text-sm text-muted-foreground">
          T-3: character height at least 0.25° of visual angle, ideally 0.4°. Labels at least 12 pt
          (16 px). Assumes {viewingDistanceMm} mm viewing distance, 96 dpi, and a cap height of 0.7
          em.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sample</TableHead>
              <TableHead className="text-right">Size (px)</TableHead>
              <TableHead className="text-right">Cap height (mm)</TableHead>
              <TableHead className="text-right">Angle (°)</TableHead>
              <TableHead>Body text</TableHead>
              <TableHead>Labels</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {textSizes.map((size) => {
              const { mm, degrees } = capHeight(size.px);
              return (
                <TableRow key={size.className}>
                  <TableCell className={size.className}>Seal the airlock</TableCell>
                  <TableCell className="text-right font-mono">{size.px}</TableCell>
                  <TableCell className="text-right font-mono">{mm.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono">{degrees.toFixed(3)}</TableCell>
                  <TableCell>
                    <Verdict pass={degrees >= 0.25} />
                  </TableCell>
                  <TableCell>
                    <Verdict pass={size.px >= 16} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section id="number-formatting" title="Number formatting" className="flex-col">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bad</TableHead>
              <TableHead>Good</TableHead>
              <TableHead>Rule</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numberFormats.map((row) => (
              <TableRow key={row.bad}>
                <TableCell className="font-mono text-destructive-foreground line-through">
                  {row.bad}
                </TableCell>
                <TableCell className="font-mono">{row.good}</TableCell>
                <TableCell className="text-muted-foreground">{row.rule}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section id="data-states" title="Data states" className="flex-col">
        <p className="text-sm text-muted-foreground">
          D-1 to D-3: stale, missing, out-of-limit, and overflowing values never pass for live ones.
        </p>
        <div className="flex flex-wrap gap-8">
          <Readout label="Live">
            <span className="font-mono text-lg">21.0 °C</span>
          </Readout>
          <Readout label="Stale (D-1)">
            <span className="font-mono text-lg text-muted-foreground">21.0 °C</span>
            <span className="font-mono text-sm text-muted-foreground">· stale 4 m</span>
          </Readout>
          <Readout label="No data (D-1)">
            <span className="font-mono text-lg text-muted-foreground">— No data</span>
          </Readout>
          <Readout label="Caution high (D-2)">
            <ArrowUpIcon aria-label="Above caution limit" className="size-4 text-warning" />
            <span className="font-mono text-lg text-warning-foreground">27.4 °C</span>
          </Readout>
          <Readout label="Warning low (D-2)">
            <ArrowDownIcon aria-label="Below warning limit" className="size-4 text-destructive" />
            <span className="font-mono text-lg text-destructive-foreground">−4.0 °C</span>
          </Readout>
          <Readout label="Off-scale (D-2)">
            <ArrowUpIcon aria-label="Above scale" className="size-4 text-destructive" />
            <span className="font-mono text-lg text-destructive-foreground">&gt; 60.0 °C</span>
            <span className="text-sm text-muted-foreground">off-scale</span>
          </Readout>
          <Readout label="Overflow (D-3)">
            <span className="font-mono text-lg text-warning-foreground">−***.**</span>
            <span className="font-mono text-sm text-muted-foreground">V</span>
          </Readout>
        </div>
      </Section>

      <Section id="alert-levels" title="Alert levels" className="flex-col">
        <p className="text-sm text-muted-foreground">
          AL-1 and K-4: each level has its own icon, not just its color. See{" "}
          <a href="#alert" className="underline">
            Alert
          </a>{" "}
          for the components, and the emergency flash (F-2 low rate, until acknowledged).
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Level</TableHead>
              <TableHead>Skill level</TableHead>
              <TableHead>Procedure link (AL-5)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alertLevels.map(({ level, skill, Icon, className }) => (
              <TableRow key={level}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden className={`size-4 ${className}`} />
                    {level}
                  </span>
                </TableCell>
                <TableCell>{skill}</TableCell>
                <TableCell>
                  {level === "Emergency" || level === "Error" ? "Required" : "No"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Confirmations of dangerous actions carry hazard tape (C-1). See{" "}
          <a href="#alert-dialog" className="underline">
            Alert Dialog
          </a>
          .
        </p>
      </Section>

      <Section id="messages" title="Messages" className="flex-col">
        <p className="text-sm text-muted-foreground">
          S-2: say what is wrong, the cause if known, and what the operator can do.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bad</TableHead>
              <TableHead>Good</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((row) => (
              <TableRow key={row.bad}>
                <TableCell className="text-destructive-foreground line-through">
                  {row.bad}
                </TableCell>
                <TableCell className="whitespace-normal">{row.good}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section id="time" title="Time" className="flex-col">
        <p className="text-sm text-muted-foreground">
          TM-1 to TM-3: always labeled with its time system, 24-hour, day count on long durations,
          and countdowns that run through zero.
        </p>
        <div className="flex flex-wrap gap-8">
          <Readout label="Current time (MTC)">
            <span className="font-mono text-lg">14:02:37</span>
          </Readout>
          <Readout label="Mission elapsed">
            <span className="font-mono text-lg">549/04:05:06</span>
          </Readout>
          <Readout label="EVA duration">
            <span className="font-mono text-lg">3/04:05:06</span>
          </Readout>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-lg">
          <span>−00:05:00</span>
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
          <span>00:00:00</span>
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
          <span>+00:05:00</span>
          <span className="font-sans text-sm text-muted-foreground">Countdown to MAV launch</span>
        </div>
      </Section>

      <Section id="color-table" title="Color table" className="flex-col">
        <p className="text-sm text-muted-foreground">
          K-2 and K-3: every color that carries meaning, and the only meanings it may carry.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Meaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {colorTable.map((row) => (
              <TableRow key={row.token}>
                <TableCell>
                  <span
                    aria-hidden
                    className="block size-5 border"
                    style={{ backgroundColor: `var(--${row.token})` }}
                  />
                </TableCell>
                <TableCell className="font-mono">--{row.token}</TableCell>
                <TableCell className="whitespace-normal">{row.meaning}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
