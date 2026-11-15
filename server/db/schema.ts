import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// Maps the existing Wrangler migration without changing physical storage or wire names.
// migrations/ remains the DDL authority, including its WITHOUT ROWID storage choices.
export const dataReleases = sqliteTable(
  "data_releases",
  {
    id: text().primaryKey(),
    processing_version: text().notNull(),
    manifest_sha256: text().notNull(),
    status: text({ enum: ["staging", "published"] }).notNull(),
    created_at: text().notNull(),
  },
  (t) => [check("release_status", sql`${t.status} IN ('staging','published')`)],
);

export const sourceProducts = sqliteTable(
  "source_products",
  {
    id: text().primaryKey(),
    release_id: text()
      .notNull()
      .references(() => dataReleases.id),
    lid: text().notNull(),
    version: text().notNull(),
    instrument: text().notNull(),
    sensor: text().notNull(),
    processing_level: text().notNull(),
    sol: integer().notNull(),
    source_url: text().notNull(),
    label_url: text().notNull(),
    sha256: text().notNull(),
    label_sha256: text().notNull(),
    verification: text().notNull(),
    sample_count: integer().notNull(),
    first_sclk_ms: integer(),
    last_sclk_ms: integer(),
    utc_start: text(),
    utc_stop: text(),
    time_quality: text().notNull(),
    warnings_json: text().notNull(),
  },
  (t) => [
    unique().on(t.release_id, t.lid, t.version),
    index("products_selection").on(t.release_id, t.instrument, t.sol, t.sensor, t.processing_level),
    check("product_warnings_json", sql`json_valid(${t.warnings_json})`),
  ],
);

export const weatherSamples = sqliteTable(
  "weather_samples",
  {
    release_id: text()
      .notNull()
      .references(() => dataReleases.id),
    utc_ms: integer().notNull(),
    sol: integer().notNull(),
    temperature_k: real(),
    pressure_pa: real(),
    water_vapor_ppm: real(),
  },
  (t) => [primaryKey({ columns: [t.release_id, t.utc_ms] })],
);

export const fieldDefinitions = sqliteTable(
  "field_definitions",
  {
    product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    field: text().notNull(),
    source_field: text().notNull(),
    source_unit: text(),
    unit: text(),
    description: text().notNull(),
    provenance: text().notNull(),
    rules_json: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.field] }),
    check("field_rules_json", sql`json_valid(${t.rules_json})`),
  ],
);

export const qualityIssues = sqliteTable(
  "quality_issues",
  {
    product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    field: text().notNull(),
    start_row: integer().notNull(),
    end_row: integer().notNull(),
    code: text().notNull(),
    detail: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.product_id, t.field, t.start_row, t.code] })],
);

function medaColumns() {
  return {
    product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    source_row: integer().notNull(),
    sclk_ms: integer().notNull(),
    utc_ms: integer(),
    lmst: text().notNull(),
    ltst: text().notNull(),
  };
}

export const medaAtsSamples = sqliteTable(
  "meda_ats_samples",
  {
    ...medaColumns(),
    ats_local_temp1: real(),
    ats_local_temp2: real(),
    ats_local_temp3: real(),
    ats_local_temp4: real(),
    ats_local_temp5: real(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("ats_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaPsSamples = sqliteTable(
  "meda_ps_samples",
  {
    ...medaColumns(),
    pressure: real(),
    pressure_uncertainty: real(),
    barocap1_pressure: real(),
    barocap2_pressure: real(),
    barocap3_pressure: real(),
    barocap1_pressure_uncertainty: real(),
    barocap2_pressure_uncertainty: real(),
    barocap3_pressure_uncertainty: real(),
    thermocap1_temp: real(),
    thermocap2_temp: real(),
    transducer: integer(),
    pressure_measurement_mode: text(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("ps_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaRhsSamples = sqliteTable(
  "meda_rhs_samples",
  {
    ...medaColumns(),
    local_relative_humidity: real(),
    local_relative_humidity_uncertainty: real(),
    humidity_local_temp: real(),
    humidity_local_temp_uncertainty: real(),
    volume_mixing_ratio: real(),
    volume_mixing_ratio_uncertainty: real(),
    humicap_a_humidity: real(),
    humicap_b_humidity: real(),
    humicap_a_humidity_uncertainty: real(),
    humicap_b_humidity_uncertainty: real(),
    humicap_temp: real(),
    humicap_temp_uncertainty: real(),
    thermocap1_temp: real(),
    thermocap2_temp: real(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("rhs_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaTirsSamples = sqliteTable(
  "meda_tirs_samples",
  {
    ...medaColumns(),
    downward_lw_irradiance: real(),
    downward_lw_irradiance_uncertainty: real(),
    upward_lw_irradiance: real(),
    upward_lw_irradiance_uncertainty: real(),
    upward_sw_irradiance: real(),
    upward_sw_irradiance_uncertainty: real(),
    air_temp: real(),
    air_temp_uncertainty: real(),
    ground_temp: real(),
    ground_temp_uncertainty: real(),
    rsm_head_outside_tirs_upward_looking_fov: integer(),
    wheel_outside_tirs_downward_looking_fov: integer(),
    sun_outside_tirs_fov: integer(),
    rover_low_tilt: integer(),
    tirs_ground_footprint_not_in_shadow: integer(),
    rover_hga_off: integer(),
    skycam_off: integer(),
    rover_still: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("tirs_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaRdsSamples = sqliteTable(
  "meda_rds_samples",
  {
    ...medaColumns(),
    rds_lat_1: real(),
    rds_lat_2: real(),
    rds_lat_3: real(),
    rds_lat_4: real(),
    rds_lat_5: real(),
    rds_lat_6: real(),
    rds_lat_7: real(),
    rds_lat_8: real(),
    rds_top_1: real(),
    rds_top_2: real(),
    rds_top_3: real(),
    rds_top_4: real(),
    rds_top_5: real(),
    rds_top_6: real(),
    rds_top_7: real(),
    rds_top_8: real(),
    rds_lat_1_hg: real(),
    rds_lat_2_hg: real(),
    rds_lat_3_hg: real(),
    rds_lat_4_hg: real(),
    rds_lat_5_hg: real(),
    rds_lat_6_hg: real(),
    rds_lat_7_hg: real(),
    rds_lat_8_hg: real(),
    rds_top_1_hg: real(),
    rds_top_2_hg: real(),
    rds_top_3_hg: real(),
    rds_top_4_hg: real(),
    rds_top_5_hg: real(),
    rds_top_6_hg: real(),
    rds_top_7_hg: real(),
    rds_top_8_hg: real(),
    rover_hga_still: integer(),
    rover_still: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("rds_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaEngSamples = sqliteTable(
  "meda_eng_samples",
  {
    ...medaColumns(),
    icu_analog_th_hk_tm: real(),
    icu_analog_tirs_acq_temp_tm: real(),
    icu_analog_5v_current_tm: real(),
    icu_analog_8v_current_tm: real(),
    icu_analog_11vn_current_tm: real(),
    icu_analog_3v3_hk_mux: real(),
    icu_analog_meda_rds_temp: real(),
    icu_analog_cam_pcb_prt: real(),
    icu_analog_cam_ccd_prt: real(),
    icu_analog_12v_htr_current_tm: real(),
    icu_analog_ws1_prt: real(),
    icu_analog_ws2_prt: real(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("eng_time").on(t.product_id, t.sclk_ms),
  ],
);

export const medaAncillarySamples = sqliteTable(
  "meda_ancillary_samples",
  {
    ...medaColumns(),
    solar_longitude_angle: real(),
    solar_zenithal_angle: real(),
    rover_position_x: real(),
    rover_position_y: real(),
    rover_position_z: real(),
    rover_velocity: real(),
    rover_pitch: real(),
    rover_yaw: real(),
    rover_roll: real(),
    masthead_azimuth: real(),
    masthead_elevation: real(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("ancillary_time").on(t.product_id, t.sclk_ms),
  ],
);

export const moxieRuns = sqliteTable(
  "moxie_runs",
  {
    id: text().primaryKey(),
    release_id: text()
      .notNull()
      .references(() => dataReleases.id),
    directory_sol: integer().notNull(),
    nasa_run_id: text(),
    calibrated_product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    derived_product_id: text().references(() => sourceProducts.id),
    sample_count: integer().notNull(),
    time_quality: text().notNull(),
    warnings_json: text().notNull(),
  },
  (t) => [
    index("runs_release").on(t.release_id, t.directory_sol),
    check("run_warnings_json", sql`json_valid(${t.warnings_json})`),
  ],
);

export const moxieSamples = sqliteTable(
  "moxie_samples",
  {
    run_id: text()
      .notNull()
      .references(() => moxieRuns.id),
    source_row: integer().notNull(),
    segment_id: integer().notNull(),
    elapsed_ms: integer().notNull(),
    sclk_ms: integer(),
    utc_ms: integer(),
    oxygen_rate_g_h: real(),
    total_power_w: real(),
    main_power_w: real(),
    soxe_power_w: real(),
    archive_energy_wh: real(),
    top_temperature_k: real(),
    bottom_temperature_k: real(),
    top_current_a: real(),
    bottom_current_a: real(),
    main_voltage_v: real(),
    inlet_pressure_pa: real(),
    cathode_pressure_pa: real(),
    mode: integer(),
    top_enabled: integer(),
    bottom_enabled: integer(),
    fault_count: integer(),
    last_fault_code: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.run_id, t.source_row] }),
    index("moxie_elapsed").on(t.run_id, t.segment_id, t.elapsed_ms),
  ],
);

export const experimentSummaries = sqliteTable("experiment_summaries", {
  run_id: text()
    .primaryKey()
    .references(() => moxieRuns.id),
  derived_count: integer().notNull(),
  active_seconds: integer(),
  oxygen_g: real(),
  archive_energy_wh: real(),
  integrated_energy_wh: real(),
  peak_oxygen_g_h: real(),
  active_mean_oxygen_g_h: real(),
  max_energy_residual_wh: real(),
  max_power_residual_w: real(),
  integration_convention: text().notNull(),
});

export const metricRollups = sqliteTable(
  "metric_rollups",
  {
    product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    field: text().notNull(),
    bucket_sclk_ms: integer().notNull(),
    count: integer().notNull(),
    minimum: real(),
    maximum: real(),
    mean: real(),
  },
  (t) => [primaryKey({ columns: [t.product_id, t.field, t.bucket_sclk_ms] })],
);

// Curiosity RAD at Gale crater, aligned by UTC. No sclk_ms: MSL and Perseverance clocks differ.
export const radObservations = sqliteTable(
  "rad_observations",
  {
    product_id: text()
      .notNull()
      .references(() => sourceProducts.id),
    source_row: integer().notNull(),
    utc_ms: integer().notNull(),
    alive_time_s: real(),
    flag: text(),
    dose_rate_b_ugy_day: real(),
    dose_rate_b_rtg_corrected_ugy_day: real(),
    dose_rate_e_ugy_day: real(),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.source_row] }),
    index("rad_time").on(t.product_id, t.utc_ms),
  ],
);

export const missionSessions = sqliteTable(
  "mission_sessions",
  {
    id: text().primaryKey(),
    token_hash: text().notNull(),
    release_id: text()
      .notNull()
      .references(() => dataReleases.id),
    revision: integer().notNull(),
    config_json: text().notNull(),
    events_json: text().notNull(),
    clock_json: text().notNull(),
    created_ms: integer().notNull(),
    expires_ms: integer().notNull(),
    last_command_id: text(),
    last_command_hash: text(),
  },
  (t) => [
    index("session_expiry").on(t.expires_ms),
    check("session_revision", sql`${t.revision} >= 0`),
    check("session_config_json", sql`json_valid(${t.config_json})`),
    check("session_events_json", sql`json_valid(${t.events_json})`),
    check("session_clock_json", sql`json_valid(${t.clock_json})`),
  ],
);

export const missionCommands = sqliteTable(
  "mission_commands",
  {
    session_id: text()
      .notNull()
      .references(() => missionSessions.id, { onDelete: "cascade" }),
    command_id: text().notNull(),
    request_hash: text().notNull(),
    applied_revision: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.session_id, t.command_id] })],
);

export const scenarioPresets = sqliteTable(
  "scenario_presets",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    model_version: text().notNull(),
    provenance: text({ enum: ["assumed"] }).notNull(),
    config_json: text().notNull(),
  },
  (t) => [
    check("preset_provenance", sql`${t.provenance} = 'assumed'`),
    check("preset_config_json", sql`json_valid(${t.config_json})`),
  ],
);

export const MEDA_TABLES = {
  ats: medaAtsSamples,
  ps: medaPsSamples,
  rhs: medaRhsSamples,
  tirs: medaTirsSamples,
  rds: medaRdsSamples,
  eng: medaEngSamples,
  ancillary: medaAncillarySamples,
} as const;
