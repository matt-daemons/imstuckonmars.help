CREATE TABLE data_releases (
  id TEXT PRIMARY KEY,
  processing_version TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staging', 'published')),
  created_at TEXT NOT NULL
);

CREATE TABLE source_products (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES data_releases(id),
  lid TEXT NOT NULL,
  version TEXT NOT NULL,
  instrument TEXT NOT NULL,
  sensor TEXT NOT NULL,
  processing_level TEXT NOT NULL,
  sol INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  label_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  label_sha256 TEXT NOT NULL,
  verification TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  first_sclk_ms INTEGER,
  last_sclk_ms INTEGER,
  utc_start TEXT,
  utc_stop TEXT,
  time_quality TEXT NOT NULL,
  warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json)),
  UNIQUE (release_id, lid, version)
);
CREATE INDEX products_selection ON source_products(release_id, instrument, sol, sensor, processing_level);

CREATE TABLE field_definitions (
  product_id TEXT NOT NULL REFERENCES source_products(id),
  field TEXT NOT NULL,
  source_field TEXT NOT NULL,
  source_unit TEXT,
  unit TEXT,
  description TEXT NOT NULL,
  provenance TEXT NOT NULL,
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  PRIMARY KEY (product_id, field)
) WITHOUT ROWID;

CREATE TABLE quality_issues (
  product_id TEXT NOT NULL REFERENCES source_products(id),
  field TEXT NOT NULL,
  start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  code TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (product_id, field, start_row, code)
) WITHOUT ROWID;

CREATE TABLE meda_ats_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  ats_local_temp1 REAL, ats_local_temp2 REAL, ats_local_temp3 REAL,
  ats_local_temp4 REAL, ats_local_temp5 REAL,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX ats_time ON meda_ats_samples(product_id, sclk_ms);

CREATE TABLE meda_ps_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  pressure REAL, pressure_uncertainty REAL,
  barocap1_pressure REAL, barocap2_pressure REAL, barocap3_pressure REAL,
  barocap1_pressure_uncertainty REAL, barocap2_pressure_uncertainty REAL, barocap3_pressure_uncertainty REAL,
  thermocap1_temp REAL, thermocap2_temp REAL, transducer INTEGER, pressure_measurement_mode TEXT,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX ps_time ON meda_ps_samples(product_id, sclk_ms);

CREATE TABLE meda_rhs_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  local_relative_humidity REAL, local_relative_humidity_uncertainty REAL,
  humidity_local_temp REAL, humidity_local_temp_uncertainty REAL,
  volume_mixing_ratio REAL, volume_mixing_ratio_uncertainty REAL,
  humicap_a_humidity REAL, humicap_b_humidity REAL,
  humicap_a_humidity_uncertainty REAL, humicap_b_humidity_uncertainty REAL,
  humicap_temp REAL, humicap_temp_uncertainty REAL,
  thermocap1_temp REAL, thermocap2_temp REAL,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX rhs_time ON meda_rhs_samples(product_id, sclk_ms);

CREATE TABLE meda_tirs_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  downward_lw_irradiance REAL, downward_lw_irradiance_uncertainty REAL,
  upward_lw_irradiance REAL, upward_lw_irradiance_uncertainty REAL,
  upward_sw_irradiance REAL, upward_sw_irradiance_uncertainty REAL,
  air_temp REAL, air_temp_uncertainty REAL, ground_temp REAL, ground_temp_uncertainty REAL,
  rsm_head_outside_tirs_upward_looking_fov INTEGER,
  wheel_outside_tirs_downward_looking_fov INTEGER, sun_outside_tirs_fov INTEGER,
  rover_low_tilt INTEGER, tirs_ground_footprint_not_in_shadow INTEGER,
  rover_hga_off INTEGER, skycam_off INTEGER, rover_still INTEGER,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX tirs_time ON meda_tirs_samples(product_id, sclk_ms);

CREATE TABLE meda_rds_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  rds_lat_1 REAL, rds_lat_2 REAL, rds_lat_3 REAL, rds_lat_4 REAL,
  rds_lat_5 REAL, rds_lat_6 REAL, rds_lat_7 REAL, rds_lat_8 REAL,
  rds_top_1 REAL, rds_top_2 REAL, rds_top_3 REAL, rds_top_4 REAL,
  rds_top_5 REAL, rds_top_6 REAL, rds_top_7 REAL, rds_top_8 REAL,
  rds_lat_1_hg REAL, rds_lat_2_hg REAL, rds_lat_3_hg REAL, rds_lat_4_hg REAL,
  rds_lat_5_hg REAL, rds_lat_6_hg REAL, rds_lat_7_hg REAL, rds_lat_8_hg REAL,
  rds_top_1_hg REAL, rds_top_2_hg REAL, rds_top_3_hg REAL, rds_top_4_hg REAL,
  rds_top_5_hg REAL, rds_top_6_hg REAL, rds_top_7_hg REAL, rds_top_8_hg REAL,
  rover_hga_still INTEGER, rover_still INTEGER,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX rds_time ON meda_rds_samples(product_id, sclk_ms);

CREATE TABLE meda_eng_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  icu_analog_th_hk_tm REAL, icu_analog_tirs_acq_temp_tm REAL,
  icu_analog_5v_current_tm REAL, icu_analog_8v_current_tm REAL, icu_analog_11vn_current_tm REAL,
  icu_analog_3v3_hk_mux REAL, icu_analog_meda_rds_temp REAL,
  icu_analog_cam_pcb_prt REAL, icu_analog_cam_ccd_prt REAL,
  icu_analog_12v_htr_current_tm REAL, icu_analog_ws1_prt REAL, icu_analog_ws2_prt REAL,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX eng_time ON meda_eng_samples(product_id, sclk_ms);

CREATE TABLE meda_ancillary_samples (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  sclk_ms INTEGER NOT NULL, utc_ms INTEGER, lmst TEXT NOT NULL, ltst TEXT NOT NULL,
  solar_longitude_angle REAL, solar_zenithal_angle REAL,
  rover_position_x REAL, rover_position_y REAL, rover_position_z REAL,
  rover_velocity REAL, rover_pitch REAL, rover_yaw REAL, rover_roll REAL,
  masthead_azimuth REAL, masthead_elevation REAL,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX ancillary_time ON meda_ancillary_samples(product_id, sclk_ms);

CREATE TABLE moxie_runs (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES data_releases(id),
  directory_sol INTEGER NOT NULL,
  nasa_run_id TEXT,
  calibrated_product_id TEXT NOT NULL REFERENCES source_products(id),
  derived_product_id TEXT REFERENCES source_products(id),
  sample_count INTEGER NOT NULL,
  time_quality TEXT NOT NULL,
  warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json))
);
CREATE INDEX runs_release ON moxie_runs(release_id, directory_sol);

CREATE TABLE moxie_samples (
  run_id TEXT NOT NULL REFERENCES moxie_runs(id), source_row INTEGER NOT NULL,
  segment_id INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL,
  sclk_ms INTEGER, utc_ms INTEGER,
  oxygen_rate_g_h REAL, total_power_w REAL, main_power_w REAL, soxe_power_w REAL,
  archive_energy_wh REAL, top_temperature_k REAL, bottom_temperature_k REAL,
  top_current_a REAL, bottom_current_a REAL, main_voltage_v REAL,
  inlet_pressure_pa REAL, cathode_pressure_pa REAL,
  mode INTEGER, top_enabled INTEGER, bottom_enabled INTEGER,
  fault_count INTEGER, last_fault_code INTEGER,
  PRIMARY KEY(run_id, source_row)
) WITHOUT ROWID;
CREATE INDEX moxie_elapsed ON moxie_samples(run_id, segment_id, elapsed_ms);

CREATE TABLE experiment_summaries (
  run_id TEXT PRIMARY KEY REFERENCES moxie_runs(id),
  derived_count INTEGER NOT NULL, active_seconds INTEGER,
  oxygen_g REAL, archive_energy_wh REAL, integrated_energy_wh REAL,
  peak_oxygen_g_h REAL, active_mean_oxygen_g_h REAL,
  max_energy_residual_wh REAL, max_power_residual_w REAL,
  integration_convention TEXT NOT NULL
);

CREATE TABLE metric_rollups (
  product_id TEXT NOT NULL REFERENCES source_products(id), field TEXT NOT NULL,
  bucket_sclk_ms INTEGER NOT NULL, count INTEGER NOT NULL,
  minimum REAL, maximum REAL, mean REAL,
  PRIMARY KEY(product_id, field, bucket_sclk_ms)
) WITHOUT ROWID;

CREATE TABLE mission_sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES data_releases(id),
  revision INTEGER NOT NULL, config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  events_json TEXT NOT NULL CHECK (json_valid(events_json)),
  clock_json TEXT NOT NULL CHECK (json_valid(clock_json)),
  created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
  last_command_id TEXT, last_command_hash TEXT,
  CHECK(revision >= 0)
);
CREATE INDEX session_expiry ON mission_sessions(expires_ms);

CREATE TABLE mission_commands (
  session_id TEXT NOT NULL REFERENCES mission_sessions(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL, request_hash TEXT NOT NULL, applied_revision INTEGER NOT NULL,
  PRIMARY KEY(session_id, command_id)
) WITHOUT ROWID;

CREATE TABLE scenario_presets (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, model_version TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK(provenance = 'assumed'),
  config_json TEXT NOT NULL CHECK(json_valid(config_json))
);
