import { LaraPanel } from "@/components/copilot/lara-panel";
import { MarsMap } from "@/components/map/mars-map";

export default function Home() {
  return (
    <main className="relative">
      <MarsMap />
      <LaraPanel />
    </main>
  );
}
