"use client";

import {
  BellIcon,
  CircleCheckIcon,
  CircleXIcon,
  InboxIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from "@/components/ui/meter";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";

import { Section } from "../_components/section";

const alertVariants = [
  { variant: "default", title: "Default", Icon: BellIcon },
  { variant: "info", title: "Info", Icon: InfoIcon },
  { variant: "success", title: "Success", Icon: CircleCheckIcon },
  { variant: "warning", title: "Warning", Icon: TriangleAlertIcon },
  { variant: "error", title: "Error", Icon: CircleXIcon },
] as const;

const badgeVariants = [
  "default",
  "secondary",
  "outline",
  "info",
  "success",
  "warning",
  "error",
  "destructive",
] as const;

const toastTypes = ["info", "success", "warning", "error", "loading"] as const;

export function Feedback() {
  return (
    <>
      <Section id="alert" title="Alert" className="flex-col">
        {alertVariants.map(({ variant, title, Icon }) => (
          <Alert key={variant} variant={variant}>
            <Icon />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>Dust storm expected at sol 550.</AlertDescription>
          </Alert>
        ))}
      </Section>

      <Section id="badge" title="Badge" className="flex-col">
        <div className="flex flex-wrap items-center gap-2">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm">sm</Badge>
          <Badge>default</Badge>
          <Badge size="lg">lg</Badge>
        </div>
      </Section>

      <Section id="toast" title="Toast">
        <Button
          onClick={() =>
            toastManager.add({ title: "Supply drop scheduled", description: "Sol 600, 14:00 MTC" })
          }
          variant="outline"
        >
          Default
        </Button>
        {toastTypes.map((type) => (
          <Button
            key={type}
            onClick={() => toastManager.add({ title: `${type} toast`, type })}
            variant="outline"
          >
            {type}
          </Button>
        ))}
      </Section>

      <Section id="progress" title="Progress" className="flex-col">
        <Progress className="max-w-sm" value={25} />
        <Progress className="max-w-sm" value={70} />
      </Section>

      <Section id="meter" title="Meter">
        <Meter className="w-72" value={62}>
          <MeterLabel>Battery</MeterLabel>
          <MeterValue />
          <MeterTrack>
            <MeterIndicator />
          </MeterTrack>
        </Meter>
      </Section>

      <Section id="spinner" title="Spinner" className="items-center">
        <Spinner />
        <Spinner className="size-6" />
        <Button disabled>
          <Spinner />
          Loading
        </Button>
      </Section>

      <Section id="skeleton" title="Skeleton">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </Section>

      <Section id="empty" title="Empty">
        <Empty className="w-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No messages</EmptyTitle>
            <EmptyDescription>Messages from Earth will appear here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>Send a message</Button>
          </EmptyContent>
        </Empty>
      </Section>

      <Section id="kbd" title="Kbd" className="items-center">
        <Kbd>Esc</Kbd>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>P</Kbd>
        </KbdGroup>
      </Section>
    </>
  );
}
