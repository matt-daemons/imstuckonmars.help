import type { Metadata } from "next";
import { HomebaseDashboard } from "@/components/homebase/dashboard";

export const metadata: Metadata = {
  title: "Mission console | imstuckonmars.help",
  description: "Homebase reference conditions and the NASA MOXIE experiment archive.",
};

export default function MissionPage() {
  return <HomebaseDashboard />;
}
