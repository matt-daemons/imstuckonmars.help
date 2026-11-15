import { Home } from "lucide-react";

export function HomebaseMapLabel({ enlarged = false }: { enlarged?: boolean }) {
  return (
    <span className="homebase-map-label">
      <Home aria-hidden />
      Homebase{enlarged && " · Not to scale"}
    </span>
  );
}
