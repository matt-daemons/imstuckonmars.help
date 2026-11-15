import type { Metadata } from "next";
import { HomebaseDashboard } from "@/components/homebase/dashboard";

export const metadata: Metadata = {
  title: "Mission experiments | imstuckonmars.help",
  description: "The archived NASA MOXIE experiment log, results and source notes.",
};

export default function ExperimentsPage() {
  return <HomebaseDashboard initialPage="experiments" />;
}
