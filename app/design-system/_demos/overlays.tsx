"use client";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTrigger,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Popover,
  PopoverClose,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";

import { Section } from "../_components/section";

const commands = [
  { value: "status", label: "Hab status" },
  { value: "comms", label: "Open comms" },
  { value: "rover", label: "Start rover" },
  { value: "log", label: "New log entry" },
];

export function Overlays() {
  return (
    <>
      <Section id="dialog" title="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Mission log</DialogTitle>
              <DialogDescription>Sol 549</DialogDescription>
            </DialogHeader>
            <DialogPanel>Planted another row of potatoes. Morale is high.</DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </Section>

      <Section id="alert-dialog" title="Alert Dialog">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
            Abort mission
          </AlertDialogTrigger>
          <AlertDialogPopup data-hazard>
            <AlertDialogHeader>
              <AlertDialogTitle>Abort the mission?</AlertDialogTitle>
              <AlertDialogDescription>
                The crew returns to the habitat immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
              <AlertDialogClose render={<Button variant="destructive" />}>Abort</AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </Section>

      <Section id="sheet" title="Sheet">
        {(["right", "left"] as const).map((side) => (
          <Sheet key={side}>
            <SheetTrigger render={<Button variant="outline" />}>Open {side}</SheetTrigger>
            <SheetPopup side={side}>
              <SheetHeader>
                <SheetTitle>Hab inventory</SheetTitle>
                <SheetDescription>Updated sol 549</SheetDescription>
              </SheetHeader>
              <SheetPanel>Potatoes: 400. Water: 620 L. Ketchup: 0.</SheetPanel>
              <SheetFooter>
                <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
              </SheetFooter>
            </SheetPopup>
          </Sheet>
        ))}
      </Section>

      <Section id="drawer" title="Drawer">
        <Drawer>
          <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
          <DrawerPopup>
            <DrawerHeader>
              <DrawerTitle>Rover route</DrawerTitle>
              <DrawerDescription>3,200 km to Schiaparelli</DrawerDescription>
            </DrawerHeader>
            <DrawerPanel>Swipe down or press Escape to close.</DrawerPanel>
            <DrawerFooter>
              <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
            </DrawerFooter>
          </DrawerPopup>
        </Drawer>
      </Section>

      <Section id="popover" title="Popover">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
          <PopoverPopup>
            <PopoverTitle>Weather</PopoverTitle>
            <PopoverDescription>−63 °C, light dust.</PopoverDescription>
            <PopoverClose render={<Button className="mt-3" size="sm" variant="outline" />}>
              Close
            </PopoverClose>
          </PopoverPopup>
        </Popover>
      </Section>

      <Section id="preview-card" title="Preview Card">
        <PreviewCard>
          <PreviewCardTrigger href="#preview-card" className="underline underline-offset-4">
            Acidalia Planitia
          </PreviewCardTrigger>
          <PreviewCardPopup>
            A plain in the northern lowlands and the Ares 3 landing site.
          </PreviewCardPopup>
        </PreviewCard>
      </Section>

      <Section id="tooltip" title="Tooltip">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
          <TooltipPopup>Sol 549</TooltipPopup>
        </Tooltip>
      </Section>

      <Section id="menu" title="Menu">
        <Menu>
          <MenuTrigger render={<Button variant="outline" />}>Open menu</MenuTrigger>
          <MenuPopup align="start" sideOffset={4}>
            <MenuItem>Profile</MenuItem>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Comms</MenuGroupLabel>
              <MenuItem>Call Earth</MenuItem>
              <MenuItem>Call habitat</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuCheckboxItem defaultChecked>Heater</MenuCheckboxItem>
            <MenuCheckboxItem variant="switch">Auto save</MenuCheckboxItem>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Sort by</MenuGroupLabel>
              <MenuRadioGroup defaultValue="sol">
                <MenuRadioItem value="sol">Sol</MenuRadioItem>
                <MenuRadioItem value="priority">Priority</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
            <MenuSub>
              <MenuSubTrigger>Move to</MenuSubTrigger>
              <MenuSubPopup>
                <MenuItem>Hab</MenuItem>
                <MenuItem>Rover</MenuItem>
              </MenuSubPopup>
            </MenuSub>
          </MenuPopup>
        </Menu>
      </Section>

      <Section id="context-menu" title="Context Menu">
        <ContextMenu>
          <ContextMenuTrigger className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            Right-click here
          </ContextMenuTrigger>
          <ContextMenuPopup>
            <ContextMenuItem>Copy</ContextMenuItem>
            <ContextMenuItem>Paste</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
              <ContextMenuSubPopup>
                <ContextMenuItem>Inspect</ContextMenuItem>
              </ContextMenuSubPopup>
            </ContextMenuSub>
          </ContextMenuPopup>
        </ContextMenu>
      </Section>

      <Section id="command" title="Command">
        <CommandDialog>
          <CommandDialogTrigger render={<Button variant="outline" />}>
            Open command palette
          </CommandDialogTrigger>
          <CommandDialogPopup>
            <Command items={commands}>
              <CommandInput placeholder="Search commands" />
              <CommandEmpty>No commands found.</CommandEmpty>
              <CommandList>
                {(item: (typeof commands)[number]) => (
                  <CommandItem key={item.value} value={item.value}>
                    {item.label}
                  </CommandItem>
                )}
              </CommandList>
            </Command>
          </CommandDialogPopup>
        </CommandDialog>
      </Section>
    </>
  );
}
