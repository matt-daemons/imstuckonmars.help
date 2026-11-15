import { LaraProvider } from "@/components/copilot/lara-context";
import { LaraLauncher } from "@/components/copilot/lara-launcher";
import { LaraPanel } from "@/components/copilot/lara-panel";
import { MarsMap } from "@/components/map/mars-map";
import { VerdictStrip } from "@/components/route/verdict-strip";

export default function Home() {
  return (
    <main className="relative">
      {/* One LARA session, shared by the verdict strip and the chat. */}
      <LaraProvider>
        <MarsMap>
          <VerdictStrip />
          <LaraLauncher>
            <LaraPanel />
          </LaraLauncher>
        </MarsMap>
      </LaraProvider>
    </main>
  );
}
