import { ColorSwatch } from "../_components/color-swatch";
import { Section } from "../_components/section";

const colorGroups = [
  {
    title: "Surfaces",
    tokens: [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
    ],
  },
  {
    title: "Brand",
    tokens: [
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "accent",
      "accent-foreground",
      "muted",
      "muted-foreground",
    ],
  },
  {
    title: "Status",
    tokens: [
      "destructive",
      "destructive-foreground",
      "destructive-contrast",
      "info",
      "info-foreground",
      "success",
      "success-foreground",
      "warning",
      "warning-foreground",
    ],
  },
  { title: "Lines", tokens: ["border", "input", "ring"] },
  { title: "Charts", tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
  {
    title: "Sidebar",
    tokens: [
      "sidebar",
      "sidebar-foreground",
      "sidebar-primary",
      "sidebar-primary-foreground",
      "sidebar-accent",
      "sidebar-accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ],
  },
];

const fontFamilies = [
  { label: "Sans", token: "--font-sans", className: "font-sans" },
  { label: "Heading", token: "--font-heading", className: "font-heading" },
  { label: "Mono", token: "--font-mono", className: "font-mono" },
];

const textSizes = [
  { className: "text-xs", label: "text-xs" },
  { className: "text-sm", label: "text-sm" },
  { className: "text-base", label: "text-base" },
  { className: "text-lg", label: "text-lg" },
  { className: "text-xl", label: "text-xl" },
  { className: "text-2xl", label: "text-2xl" },
  { className: "text-3xl", label: "text-3xl" },
  { className: "text-4xl", label: "text-4xl" },
  { className: "text-5xl", label: "text-5xl" },
];

const fontWeights = [
  { className: "font-normal", label: "font-normal" },
  { className: "font-medium", label: "font-medium" },
  { className: "font-semibold", label: "font-semibold" },
  { className: "font-bold", label: "font-bold" },
];

const radii = [
  { className: "rounded-sm", label: "rounded-sm" },
  { className: "rounded-md", label: "rounded-md" },
  { className: "rounded-lg", label: "rounded-lg" },
  { className: "rounded-xl", label: "rounded-xl" },
  { className: "rounded-2xl", label: "rounded-2xl" },
  { className: "rounded-3xl", label: "rounded-3xl" },
  { className: "rounded-4xl", label: "rounded-4xl" },
  { className: "rounded-full", label: "rounded-full" },
];

const shadows = [
  { className: "shadow-xs", label: "shadow-xs" },
  { className: "shadow-sm", label: "shadow-sm" },
  { className: "shadow-md", label: "shadow-md" },
  { className: "shadow-lg", label: "shadow-lg" },
  { className: "shadow-xl", label: "shadow-xl" },
];

export function Foundations() {
  return (
    <>
      <Section id="colors" title="Colors" className="flex-col gap-8">
        {colorGroups.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h4 className="text-sm font-medium text-muted-foreground">{group.title}</h4>
            <div className="flex flex-wrap gap-4">
              {group.tokens.map((token) => (
                <ColorSwatch key={token} token={token} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section id="typography" title="Typography" className="flex-col gap-8">
        <div className="flex flex-col gap-3">
          {fontFamilies.map((font) => (
            <div key={font.token} className="flex items-baseline gap-4">
              <code className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                {font.token}
              </code>
              <span className={`${font.className} text-2xl`}>
                {font.label}: Sol 549, 0x2A, 1234567890
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {textSizes.map((size) => (
            <div key={size.label} className="flex items-baseline gap-4">
              <code className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                {size.label}
              </code>
              <span className={`${size.className} truncate`}>I&apos;m stuck on Mars</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {fontWeights.map((weight) => (
            <div key={weight.label} className="flex items-baseline gap-4">
              <code className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                {weight.label}
              </code>
              <span className={`${weight.className} text-lg`}>I&apos;m stuck on Mars</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="radius" title="Radius">
        {radii.map((radius) => (
          <div key={radius.label} className="flex flex-col items-center gap-2">
            <div className={`${radius.className} size-20 border-2 border-primary bg-muted`} />
            <code className="font-mono text-xs text-muted-foreground">{radius.label}</code>
          </div>
        ))}
      </Section>

      <Section id="shadows" title="Shadows" className="gap-8">
        {shadows.map((shadow) => (
          <div key={shadow.label} className="flex flex-col items-center gap-2">
            <div className={`${shadow.className} size-20 rounded-xl border bg-background`} />
            <code className="font-mono text-xs text-muted-foreground">{shadow.label}</code>
          </div>
        ))}
      </Section>
    </>
  );
}
