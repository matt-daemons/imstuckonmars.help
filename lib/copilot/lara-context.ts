import * as zod from "zod";

/**
 * What the browser tells LARA about the route plan and the simulated expedition with each question.
 * It is untrusted client data: the server checks it against these schemas, and LARA reads it as data.
 */

/** The whole context, as JSON, may not be longer than this. */
export const MAX_CONTEXT_CHARS = 24_000;
export const MAX_DESTINATIONS = 12;
export const MAX_TEXT = 300;
export const MAX_REASONS = 8;
export const MAX_ASSUMPTIONS = 16;

/** What the app says itself when a destination is selected, before the model's answer. */
export const ROUTE_CHECK_SENTENCE = "Starting route calculation and safety analysis.";

const text = zod.string().max(MAX_TEXT);
const amount = zod.number().finite();
const verdict = zod.enum(["GO", "CAUTION", "NO_GO"]);

export const routeChoiceSchema = zod.enum(["safest", "shortest"]);

const destinationSchema = zod
  .object({
    /** 1-based, nearest to the base first, as the Where step lists them. */
    number: zod.number().int().min(1).max(MAX_DESTINATIONS),
    title: text,
    /** False when the HiRISE team calls the feature "possible". */
    confirmed: zod.boolean(),
    straight_line_km: amount,
  })
  .strict();

const driveFactsSchema = zod
  .object({
    one_way_km: amount,
    odometer_km: amount,
    driving_hours: amount,
    sols: amount,
    hardest_sol_kwh: amount,
    battery_left_percent: amount,
    reserve_km: amount,
    max_slope_deg: amount,
    power: zod.enum(["solar", "fission"]),
    loose_dust_km: amount,
    no_ground_data_km: amount,
  })
  .strict();

const walkFactsSchema = zod
  .object({
    out_and_back_km: amount,
    walking_min: amount,
    /** Null on a walking mission, whose check has no sampling or suit timing. */
    sampling_min: amount.nullable(),
    suit_time_min: amount.nullable(),
    suit_minutes_left: amount.nullable(),
    max_slope_deg: amount,
  })
  .strict();

const routeFactsSchema = zod
  .object({
    /** Null for a walking mission, which has no drive. */
    drive: driveFactsSchema.nullable(),
    walk: walkFactsSchema,
    verdict: zod
      .object({
        verdict,
        limiting_factor: text.nullable(),
        reasons: zod.array(text).max(MAX_REASONS),
      })
      .strict(),
  })
  .strict();

export const routePlanContextSchema = zod
  .object({
    mission: zod.enum(["walking", "drive-walk"]),
    step: zod.enum(["mission", "where", "check", "go"]),
    route_choice: routeChoiceSchema,
    shortest_on_map: zod.boolean(),
    destinations: zod.array(destinationSchema).max(MAX_DESTINATIONS),
    /** The destination's number, or null when the end is a point set on the map. */
    destination_number: zod.number().int().min(1).max(MAX_DESTINATIONS).nullable(),
    status: zod.enum([
      "planning",
      "ok",
      "no_destination",
      "no_staging",
      "drive_failed",
      "walk_failed",
      "terrain_failed",
    ]),
    routes: zod
      .object({ safest: routeFactsSchema.nullable(), shortest: routeFactsSchema.nullable() })
      .strict(),
    /** Where the rover parks for the walk, longitude 0..360 °E as the map shows it. */
    staging_point: zod
      .object({ lon_east: amount, lat: amount, km_to_destination: amount })
      .strict()
      .nullable(),
    not_checked: text,
    assumptions: zod.array(text).max(MAX_ASSUMPTIONS),
  })
  .strict();

export type RoutePlanContext = zod.infer<typeof routePlanContextSchema>;
export type RouteFacts = zod.infer<typeof routeFactsSchema>;
export type DestinationFacts = zod.infer<typeof destinationSchema>;

const resourceSchema = zod
  .object({ remaining: amount, reserve: amount, capacity: amount })
  .strict();

export const simulationSummarySchema = zod
  .object({
    state: zod.enum(["idle", "playing", "paused", "done"]),
    phase: zod.enum(["drive_out", "walk_out", "sampling", "walk_back", "drive_back", "done"]),
    elapsed_min: amount,
    total_min: amount,
    distance_done_km: amount,
    distance_total_km: amount,
    rover_battery_wh: resourceSchema.nullable(),
    suit_oxygen_min: zod.object({ remaining: amount, reserve: amount }).strict().nullable(),
    labels: zod.array(text).max(MAX_ASSUMPTIONS),
  })
  .strict();

/**
 * Only the size is checked here, so one malformed key does not cost LARA the other: each key is
 * checked on its own by readLaraContext.
 */
export const laraContextSchema = zod
  .object({ route_plan: zod.unknown().optional(), simulation: zod.unknown().optional() })
  .strict()
  .refine((context) => JSON.stringify(context).length <= MAX_CONTEXT_CHARS, {
    message: `The context may be no longer than ${MAX_CONTEXT_CHARS} characters of JSON`,
  });

/** One context key: its checked value, absent when the app did not send it, or invalid. */
export type ContextEntry<T> =
  | { status: "present"; value: T }
  | { status: "absent" }
  | { status: "invalid" };

export interface LaraContext {
  route_plan: ContextEntry<RoutePlanContext>;
  simulation: ContextEntry<zod.infer<typeof simulationSummarySchema>>;
}

export function readLaraContext(raw: zod.infer<typeof laraContextSchema> | undefined): LaraContext {
  return {
    route_plan: readEntry(routePlanContextSchema, raw?.route_plan),
    simulation: readEntry(simulationSummarySchema, raw?.simulation),
  };
}

function readEntry<T>(schema: zod.ZodType<T>, value: unknown): ContextEntry<T> {
  if (value === undefined || value === null) return { status: "absent" };
  const result = schema.safeParse(value);
  return result.success ? { status: "present", value: result.data } : { status: "invalid" };
}
