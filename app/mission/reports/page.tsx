import type { Metadata } from "next";
import { HomebaseDashboard } from "@/components/homebase/dashboard";

export const metadata: Metadata = {
  title: "Simulation reports | imstuckonmars.help",
  description:
    "Saved reports from your simulated Mars expeditions, separate from NASA experiments.",
};

export default function ReportsPage() {
  return <HomebaseDashboard initialPage="reports" />;
}
