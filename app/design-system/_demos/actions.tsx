"use client";

import { BoldIcon, ItalicIcon, PlusIcon, RocketIcon, UnderlineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupSeparator, GroupText } from "@/components/ui/group";
import { RadioGroupPrimitive, RadioPrimitive } from "@/components/ui/radio-group";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar";

import { Section } from "../_components/section";

const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "link",
  "destructive",
  "destructive-outline",
] as const;

const buttonSizes = ["xs", "sm", "default", "lg", "xl"] as const;

const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg", "icon-xl"] as const;

export function Actions() {
  return (
    <>
      <Section id="button" title="Button" className="flex-col">
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {buttonSizes.map((size) => (
            <Button key={size} size={size} variant="outline">
              {size}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {iconSizes.map((size) => (
            <Button key={size} aria-label={`Launch (${size})`} size={size} variant="outline">
              <RocketIcon />
            </Button>
          ))}
          <Button>
            <PlusIcon />
            With icon
          </Button>
          <Button disabled>Disabled</Button>
          <Button render={<a href="#button" />} variant="link">
            As link
          </Button>
        </div>
      </Section>

      <Section id="group" title="Group">
        <Group>
          <Button variant="outline">Previous</Button>
          <GroupSeparator />
          <Button variant="outline">Next</Button>
        </Group>
        <Group>
          <GroupText>Sol</GroupText>
          <GroupSeparator />
          <Button variant="outline">549</Button>
        </Group>
      </Section>

      <Section id="toggle" title="Toggle">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle defaultPressed variant="outline">
          Pressed
        </Toggle>
        <Toggle size="sm">Small</Toggle>
        <Toggle size="lg">Large</Toggle>
        <Toggle disabled>Disabled</Toggle>
      </Section>

      <Section id="toggle-group" title="Toggle Group">
        <ToggleGroup aria-label="Text formatting" multiple>
          <ToggleGroupItem aria-label="Bold" value="bold">
            <BoldIcon />
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Italic" value="italic">
            <ItalicIcon />
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Underline" value="underline">
            <UnderlineIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup aria-label="Alignment" defaultValue={["left"]} variant="outline">
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
          <ToggleGroupItem value="center">Center</ToggleGroupItem>
          <ToggleGroupItem value="right">Right</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section id="toolbar" title="Toolbar">
        <Toolbar aria-label="Editor">
          <ToolbarGroup>
            <ToolbarButton aria-label="Bold" render={<Toggle />}>
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton aria-label="Underline" render={<Toggle />}>
              <UnderlineIcon />
            </ToolbarButton>
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarButton render={<Button size="sm" />}>Save</ToolbarButton>
        </Toolbar>
      </Section>

      <Section id="segmented-control" title="Segmented Control">
        <SegmentedControl
          aria-label="Billing period"
          render={<RadioGroupPrimitive defaultValue="monthly" />}
        >
          <SegmentedControlItem render={<RadioPrimitive.Root value="monthly" />}>
            Monthly
          </SegmentedControlItem>
          <SegmentedControlItem render={<RadioPrimitive.Root value="yearly" />}>
            Yearly
          </SegmentedControlItem>
        </SegmentedControl>
      </Section>
    </>
  );
}
