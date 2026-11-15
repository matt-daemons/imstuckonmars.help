-- Curiosity RAD Level 2 dosimetry observations (Gale crater), aligned to replays by UTC.
-- MSL spacecraft clock is not comparable with Perseverance SCLK, so there is no sclk_ms.
-- Dose rates keep the source unit (uGy/day). Flagged or invalid values are NULL, with the
-- original value retained in the immutable source product and the reason in quality_issues.
CREATE TABLE rad_observations (
  product_id TEXT NOT NULL REFERENCES source_products(id), source_row INTEGER NOT NULL,
  utc_ms INTEGER NOT NULL, alive_time_s REAL, flag TEXT,
  dose_rate_b_ugy_day REAL, dose_rate_b_rtg_corrected_ugy_day REAL, dose_rate_e_ugy_day REAL,
  PRIMARY KEY(product_id, source_row)
) WITHOUT ROWID;
CREATE INDEX rad_time ON rad_observations(product_id, utc_ms);
