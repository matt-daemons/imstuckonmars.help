import { LaraBridgeProvider } from "@/components/copilot/lara-bridge";
import { LaraProvider } from "@/components/copilot/lara-context";
import { LaraLauncher } from "@/components/copilot/lara-launcher";
import { LaraPanel } from "@/components/copilot/lara-panel";
import { ExpeditionProvider } from "@/components/expedition/expedition-provider";
import { MarsMap } from "@/components/map/mars-map";
import { VerdictStrip } from "@/components/route/verdict-strip";

export default function Home() {
  return (
    <main className="relative">
      {/* One mission session for the whole page: the map, the expedition HUD and LARA. */}
      <ExpeditionProvider>
        <LaraBridgeProvider>
        <LaraProvider>
          <MarsMap>
            <VerdictStrip />
            <LaraLauncher>
              <LaraPanel />
            </LaraLauncher>
          </MarsMap>
        </LaraProvider>
        </LaraBridgeProvider>
      </ExpeditionProvider>
    </main>
  );
}
