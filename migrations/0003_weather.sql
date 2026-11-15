-- Bounded, masked archive rollups. Source products and quality remain in the shared provenance tables.
CREATE TABLE weather_samples (
  release_id TEXT NOT NULL REFERENCES data_releases(id),
  utc_ms INTEGER NOT NULL,
  sol INTEGER NOT NULL,
  temperature_k REAL,
  pressure_pa REAL,
  water_vapor_ppm REAL,
  PRIMARY KEY (release_id, utc_ms)
) WITHOUT ROWID;
