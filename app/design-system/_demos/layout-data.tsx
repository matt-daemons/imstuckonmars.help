"use client";

import { PlusIcon } from "lucide-react";

import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardFrame,
  CardFrameAction,
  CardFrameDescription,
  CardFrameHeader,
  CardFrameTitle,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

import { Section } from "../_components/section";

const logEntries = Array.from({ length: 30 }, (_, index) => ({
  sol: 520 + index,
  entry:
    index % 3 === 0
      ? "Watered the potatoes."
      : index % 3 === 1
        ? "Fixed the airlock."
        : "Charged the rover.",
}));

const harvest = [
  { sol: 61, crop: "Potatoes", yield: "400" },
  { sol: 89, crop: "Potatoes", yield: "380" },
  { sol: 120, crop: "Potatoes", yield: "410" },
];

export function LayoutData() {
  return (
    <>
      <Section id="card" title="Card">
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Hab</CardTitle>
            <CardDescription>Pressurized, 21 °C</CardDescription>
          </CardHeader>
          <CardPanel>All systems nominal.</CardPanel>
          <CardFooter>
            <Button size="sm" variant="outline">
              Details
            </Button>
          </CardFooter>
        </Card>
        <CardFrame className="w-80">
          <CardFrameHeader>
            <CardFrameTitle>Crew</CardFrameTitle>
            <CardFrameDescription>Ares III</CardFrameDescription>
            <CardFrameAction>
              <Button size="sm" variant="outline">
                <PlusIcon />
                Add
              </Button>
            </CardFrameAction>
          </CardFrameHeader>
          <Card>
            <CardPanel>6 crew members</CardPanel>
          </Card>
        </CardFrame>
      </Section>

      <Section id="frame" title="Frame">
        <Frame className="w-80">
          <FrameHeader>
            <FrameTitle>Comms</FrameTitle>
            <FrameDescription>Pathfinder link</FrameDescription>
          </FrameHeader>
          <FramePanel>Signal strength: weak</FramePanel>
          <FrameFooter>Last contact sol 549</FrameFooter>
        </Frame>
      </Section>

      <Section id="accordion" title="Accordion">
        <Accordion className="w-full max-w-md">
          <AccordionItem value="water">
            <AccordionTrigger>How do you make water?</AccordionTrigger>
            <AccordionPanel>Reduce hydrazine to hydrogen and burn it with oxygen.</AccordionPanel>
          </AccordionItem>
          <AccordionItem value="food">
            <AccordionTrigger>How do you grow food?</AccordionTrigger>
            <AccordionPanel>Lettuce grown hydroponically in the habitat.</AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section id="collapsible" title="Collapsible">
        <Collapsible className="w-full max-w-md">
          <CollapsibleTrigger render={<Button variant="outline" />}>
            Show oxygenator status
          </CollapsibleTrigger>
          <CollapsiblePanel className="pt-3 text-sm">Running at 98% capacity.</CollapsiblePanel>
        </Collapsible>
      </Section>

      <Section id="tabs" title="Tabs" className="flex-col">
        <Tabs defaultValue="hab">
          <TabsList>
            <TabsTab value="hab">Hab</TabsTab>
            <TabsTab value="rover">Rover</TabsTab>
            <TabsTab value="mav">MAV</TabsTab>
          </TabsList>
          <TabsPanel value="hab" className="pt-3 text-sm">
            Hab systems nominal.
          </TabsPanel>
          <TabsPanel value="rover" className="pt-3 text-sm">
            Battery at 74%.
          </TabsPanel>
          <TabsPanel value="mav" className="pt-3 text-sm">
            3,200 km away.
          </TabsPanel>
        </Tabs>
        <Tabs defaultValue="hab">
          <TabsList variant="underline">
            <TabsTab value="hab">Hab</TabsTab>
            <TabsTab value="rover">Rover</TabsTab>
          </TabsList>
        </Tabs>
      </Section>

      <Section id="separator" title="Separator" className="flex-col">
        <div className="flex h-5 items-center gap-4 text-sm">
          <span>Hab</span>
          <Separator orientation="vertical" />
          <span>Rover</span>
          <Separator orientation="vertical" />
          <span>MAV</span>
        </div>
        <Separator />
      </Section>

      <Section id="scroll-area" title="Scroll Area">
        <ScrollArea className="h-48 w-72 rounded-md border">
          <div className="flex flex-col gap-2 p-4 text-sm">
            {logEntries.map((log) => (
              <p key={log.sol}>
                <span className="font-mono text-muted-foreground">Sol {log.sol}</span> {log.entry}
              </p>
            ))}
          </div>
        </ScrollArea>
      </Section>

      <Section id="table" title="Table">
        <Table>
          <TableCaption>Harvest log</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Sol</TableHead>
              <TableHead>Crop</TableHead>
              <TableHead className="text-right">Yield</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {harvest.map((row) => (
              <TableRow key={row.sol}>
                <TableCell className="font-mono">{row.sol}</TableCell>
                <TableCell>{row.crop}</TableCell>
                <TableCell className="text-right">{row.yield}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right">1,190</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Section>

      <Section id="avatar" title="Avatar" className="items-center">
        <Avatar>
          <AvatarFallback>MW</AvatarFallback>
        </Avatar>
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>ML</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>RM</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>BJ</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section id="breadcrumb" title="Breadcrumb">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#breadcrumb">Mars</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#breadcrumb">Acidalia Planitia</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Hab</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      <Section id="pagination" title="Pagination">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#pagination" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#pagination">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#pagination" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#pagination">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#pagination" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Section>

      <Section id="sidebar" title="Sidebar" className="items-center">
        <SidebarTrigger />
        <span className="text-sm text-muted-foreground">Toggles this page&apos;s navigation.</span>
      </Section>
    </>
  );
}
