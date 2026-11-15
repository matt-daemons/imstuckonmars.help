type ImageryEvent = "movestart" | "moveend" | "sourcedata" | "dataloading" | "idle";
interface ImageryMap {
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  on(event: ImageryEvent, handler: () => void): unknown;
  off(event: ImageryEvent, handler: () => void): unknown;
}

export function watchImageryLoading(map: ImageryMap, changed: (loading: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  const show = (loading: boolean) => {
    if (visible === loading) return;
    visible = loading;
    changed(loading);
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const update = () => {
    if (map.isMoving() || map.areTilesLoaded()) {
      cancel();
      show(false);
    } else if (timer === undefined && !visible) {
      // Wait for a settled view, not the intermediate tiles requested during a flight.
      timer = setTimeout(() => {
        timer = undefined;
        show(!map.isMoving() && !map.areTilesLoaded());
      }, 750);
    }
  };
  const events: ImageryEvent[] = ["movestart", "moveend", "sourcedata", "dataloading", "idle"];
  for (const event of events) map.on(event, update);
  update();
  return () => {
    cancel();
    for (const event of events) map.off(event, update);
  };
}
