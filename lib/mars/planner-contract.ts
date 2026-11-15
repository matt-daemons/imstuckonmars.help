import { z } from "zod";
import type { DriveWalkPlan } from "./drive-walk";
import type { Boulder } from "./site-grid";
import type { planWalk } from "./routing";
import type { RouteComparison } from "./route-comparison";

const point = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-85).max(85),
]);
const common = {
  start: point,
  samplingMin: z.number().finite().min(0).max(480),
  compare: z.boolean(),
  zones: z
    .array(
      z
        .object({
          id: z.string().max(100),
          name: z.string().max(100),
          ring: z.array(point).min(3).max(100),
        })
        .strict(),
    )
    .max(20)
    .refine(
      (zones) => zones.reduce((sum, zone) => sum + zone.ring.length, 0) <= 200,
      "At most 200 total zone vertices",
    ),
};
export const plannerRequestSchema = z.discriminatedUnion("mission", [
  z.object({ ...common, mission: z.literal("walking"), end: point }).strict(),
  z
    .object({
      ...common,
      mission: z.literal("drive-walk"),
      siteId: z.string().min(1).max(100),
      power: z.enum(["solar", "fission"]),
    })
    .strict(),
]);
export type PlannerRequest = z.infer<typeof plannerRequestSchema>;
export type WalkingPlan = ReturnType<typeof planWalk>;
export type PlannerResult =
  | {
      mission: "walking";
      plan: WalkingPlan;
      shortest: WalkingPlan | null;
      comparison: RouteComparison | null;
    }
  | {
      mission: "drive-walk";
      plan: DriveWalkPlan;
      shortest: DriveWalkPlan | null;
      comparison: RouteComparison | null;
      boulders: Boulder[];
      driveCellM: number;
    };
export interface PlannerResponse {
  version: string;
  key: string;
  result: PlannerResult;
}
