import type { ComponentType } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { GroupHeading } from "./_components/section";
import { Actions } from "./_demos/actions";
import { Feedback } from "./_demos/feedback";
import { Forms } from "./_demos/forms";
import { Foundations } from "./_demos/foundations";
import { LayoutData } from "./_demos/layout-data";
import { Overlays } from "./_demos/overlays";
import { sectionGroups } from "./_lib/sections";

const groupContent: Record<string, ComponentType> = {
  Foundations,
  Actions,
  Forms,
  Feedback,
  Overlays,
  "Layout & data": LayoutData,
};

function groupId(title: string) {
  return title.toLowerCase().replace(/[^a-z]+/g, "-");
}

export default function DesignSystemPage() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 font-heading font-semibold">
          <a href="#top" className="hover:underline">
            Design system
          </a>
        </SidebarHeader>
        <SidebarContent>
          {sectionGroups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.sections.map((section) => (
                    <SidebarMenuItem key={section.id}>
                      <SidebarMenuButton render={<a href={`#${section.id}`} />} size="sm">
                        {section.title}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <h1 id="top" className="font-heading text-base font-semibold">
            Design system
          </h1>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-6 py-10">
          {sectionGroups.map((group) => {
            const Content = groupContent[group.title];
            return (
              <div key={group.title} className="flex flex-col gap-10">
                <GroupHeading id={groupId(group.title)}>{group.title}</GroupHeading>
                <Content />
              </div>
            );
          })}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
