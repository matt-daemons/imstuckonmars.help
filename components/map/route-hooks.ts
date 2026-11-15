import type { DriveWalkPlan } from "@/lib/mars/drive-walk";
import type { Boulder } from "@/lib/mars/site-grid";

/** Route geometry and display metadata returned by the backend; no client terrain grids. */
export interface DriveWalk {
  driveGrid: null;
  driveSlope: null;
  siteGrid: { boulders: Boulder[] } | null;
  driveCellM?: number;
  driveFailed: boolean;
  siteFailed: boolean;
  error?: string;
  plan: DriveWalkPlan | null;
  shortest: DriveWalkPlan | null;
}
