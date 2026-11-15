# Telemetry analysis

> Acquisition update (2026-11-14): this is the pre-cleanup research snapshot. The verified retained subset and normalized counts are documented in [BACKEND.md](BACKEND.md) and `data/telemetry/sources.json`. Sol-816 MEDA measurements have since been acquired; catalogs, raw MOXIE, the 2012 RAD product and REMS were removed from the active subset. Curiosity RAD Level 2 observations overlapping sol 816 were later added as a separate release (see [RAD](#rad)). Do not treat the historical inventory below as the current checkout.

## Findings and scope

Research snapshot: 2026-11-14. This is an inspection of the local downloads, not an implemented telemetry pipeline or operational survival assessment. Preserve the existing maps and dashboard. Related recommendations: [simulation research](SIMULATION_RESEARCH.md), [features](TELEMETRY_FEATURES.md), and [architecture](TELEMETRY_ARCHITECTURE.md).

- **MOXIE supports the strongest replay:** 23 calibrated runs and 22 derived runs, with genuine one-second engineering telemetry. Six derived runs are diagnostic and produce no oxygen. The 16 positive-production runs integrate to **122.272 g** under the stated discrete convention.
- **MEDA downloads are catalogs, not sensor samples.** Their filenames do not establish that temperature, pressure, humidity, wind or dust measurements are present.
- **RAD supplies 14 historical detector-rate observations**, not astronaut dose, present-day conditions or a Jezero radiation map.
- **REMS supplies a bundle description only.** No local REMS environmental time series can be analyzed.
- NASA measurements/calibrations, archive-derived engineering quantities, new mathematical summaries and assumed mission resources must remain separately labeled. No crew oxygen tank, habitat, EVA battery or physiological telemetry is present.

## Inventory and provenance

All 426 local files were inventoried and SHA-256 hashed before analysis. Total size is 638,937,451 bytes. Counts include metadata and, for MOXIE, the original compressed archive as well as extracted products; these are not 426 independent scientific observations.

| Local directory under `data/telemetry/` | Files |       Bytes | Actual content                                                                     |
| --------------------------------------- | ----: | ----------: | ---------------------------------------------------------------------------------- |
| `meda/`                                 |   256 | 162,785,893 | CSV product-search exports, including some MOXIE references                        |
| `moxie/`                                |   167 | 469,441,170 | Raw, calibrated and derived tables; labels, inventories, documentation and archive |
| `rad/`                                  |     2 |   6,703,729 | `radiation.txt` and its PDS3 detached label                                        |
| `rems/`                                 |     1 |       6,659 | `bundle_msl_rems.xml`                                                              |

Authoritative local MOXIE definitions are in `data/telemetry/moxie/moxie_bundle/document/MOXIE_Data_Product_SIS_v7.0.pdf`, release notes in the same directory, and each CSV's XML label. Selected SHA-256 anchors:

| File, relative to `data/telemetry/`                           | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `rad/radiation.lbl`                                           | `6eb5e69243b26f845ebeda9575048ac92a72a6f2ae084431170452b4a328c25c` |
| `rad/radiation.txt`                                           | `4d08d57a55b5c48a72eaf61c554e7ebf31d5a3d50f1f7b8327d9bab8d575fc87` |
| `moxie/moxie_bundle/document/MOXIE_Release_Notes.txt`         | `33ec7f9bd60a04505a58c2d6636aa8a8748c345dcc41aaa05b6df7332412ba40` |
| `moxie/moxie_bundle/document/MOXIE_Data_Product_SIS_v7.0.pdf` | `247a3843ed8749b3015e280fcce05a4ecbb6aec0b8dc6a4dd9532e5c59d04e8e` |

## Analysis method

The one-off analysis used Python 3.12.0, the standard library and existing NumPy 1.26.4. No analysis dependencies were installed and no source products were edited. Analysis artifacts are session-local, not application code or durable project artifacts. The initial temporary directory became unavailable during final verification. Key statistics were independently recomputed from the downloads, and current hashes were regenerated for all 426 files. All four SHA-256 anchors preserved above match; file counts and byte totals match the initial inventory. Without the original complete manifest, a full 426-file before/after hash comparison cannot be claimed. The protocol and reported cohorts below are the reproducible specification.

1. Inventory every file, recording byte size and streaming SHA-256. For MEDA, parse CSV records rather than inferring content from filenames. Count nonempty rows and product URNs; deduplicate references, not environmental samples.
2. For each MOXIE `data_raw/*/*.xml`, `data_calibrated/*/*.xml` and `data_derived/*/*.xml`, parse the PDS4 label and corresponding CSV. Check physical header names/order, field count, byte offset, declared records, logical identifier/version and elapsed-time increments. Compare collection LIDVID inventories to observational labels. All inventory references match the local observational labels; no byte-identical observational CSVs were found.
3. Map columns by verified physical header names/order. Do not blindly use the erroneous derived `field_number` values. Mask each field's declared `Special_Constants` before arithmetic; also exclude blanks and nonfinite values. Do not apply a global negative-value mask.
4. Compute finite-value mean, median, extrema, sample standard deviation (`ddof=1`) and NumPy's default linear 5th/95th percentiles. Missing/N/A percentages use all rows at that processing level. Finite does not mean scientifically valid: anomalous finite values remain visible and are discussed, not silently repaired.
5. Join calibrated and derived tables within a product/run on **exact elapsed seconds**, after verifying their elapsed arrays are identical. Define the active cohort as `F_O2_I_G_HR > 0 AND (VT_en == 1 OR VB_en == 1) AND SW_MODE == 1`. All positive oxygen samples in these products satisfy this mask.
6. Use the archive's inclusive one-second sample convention: oxygen mass in g is `sum(rate_g_per_h) / 3600`; reconstructed energy in Wh is `cumsum(power_W) / 3600`. This includes the first stored sample as one second, rather than using a trapezoidal endpoint convention. Only integrate within acquired runs, never across gaps between experiments.
7. Parse RAD by `[OBSERVATION: ...]` sections and named dosimetry scalars, not by flattening every number in the file. Preserve detector identity and parse UTC as year/day-of-year. Statistics below are unweighted descriptions of the 14 available scalar values, not time-weighted exposure estimates.

## MEDA

### What is actually downloaded

All 256 CSVs contain catalog attributes such as URN, title, UTC coverage, sol, local solar time, solar longitude, Mars year and file size. They are not calibrated/derived measurement arrays, even when named for a sensor. A product's nominal start/stop time is not a locally observed weather sample.

- 514,217 nonempty catalog rows; 514,215 contain product references; two lack a URN.
- 6,949 reference-bearing rows contain two URNs (for example, a browse product and its data product). Reference occurrences therefore exceed reference-bearing row counts.
- 65,909 distinct references overall, of which 65,722 are MEDA references. The remaining references include MOXIE products misplaced in this directory.
- MEDA distinct references: 9,391 `data_calibrated_env`, 6,367 `data_derived_env`, 22,483 `browse_skycam`, 27,481 `data_skycam`.
- MEDA references have 455,074 additional occurrences beyond the first occurrence of each reference. These are overlapping catalog exports, not repeated physical measurements to average.
- Catalog coverage: 2021-02-19 21:32:23.968 UTC through 2025-09-09 17:15:51.056 UTC, sols 1-1619. This is **reference coverage**, not locally acquired sensor coverage.
- `mars_2020_meda_relative-humidity_calibrated-a.csv` is headerless. Some exports have extra/blank columns. Three wind catalogs are byte-identical: `MARS2020_MEDA_WIND_Derived_Del9.csv`, `MARS2020_MEDA_WS_Derived_Del11.csv`, and `Mars2020_MEDA_WS%20Derived_Del12.csv`.

### What to acquire next

Resolve selected catalog URNs to small, matched PDS4 XML labels and actual `data_derived_env` products. Inspect units, fill constants and per-sensor reliability before requesting a bounded time window. Prefer derived products where available; do not replace invalid derived fields with calibrated values silently.

Official MEDA guidance [S1] warns that humidity before sol 63 and wind before sol 36 are unreliable, discusses invalid values such as `9999999999`, and describes a baseline alternating 12-hour-per-sol, 1 Hz schedule. None of this establishes the cadence or completeness of samples currently local, because there are none. Dust-related context requires the appropriate measured channel or optical-depth product and its calibration, not a fabricated generic dust index.

**Unavailable analyses:** temperature/pressure/wind/humidity/dust ranges, their missingness and diurnal cycles, correlations between those variables, and MOXIE performance versus contemporaneous ambient weather. No such statistics can be computed from file sizes, catalog timestamps or product titles.

## MOXIE

### Products, clocks and schema

| Level      | Products | Actual records | Columns per table | Interpretation                                            |
| ---------- | -------: | -------------: | ----------------: | --------------------------------------------------------- |
| Raw        |       23 |        235,992 |               123 | Telemetry codes, states and engineering channels          |
| Calibrated |       23 |        235,992 |                66 | Physical-unit engineering values and states               |
| Derived    |       22 |        228,069 |                26 | Current-derived oxygen, estimated flows, power and energy |

All 22 derived tables and their calibrated companions have contiguous one-second elapsed samples, with no duplicate or backward times. Derived `T` and corresponding calibrated `SW_TIME` arrays match exactly. The other raw/calibrated diagnostic products are also contiguous except sol 901, whose counter resets as detailed below. These are boot-relative elapsed counters, not automatically UTC or local solar time. Separate runs have long gaps and must not be stitched into continuous Mars weather.

Derived label coverage begins 2021-02-22 and ends 2023-08-08. The collection advertises through sol 901/2023-09-02 because the final raw/calibrated run exists. The old README's sols 0-659 statement is stale. Directory names below are product identifiers, not unquestioned authoritative times.

Known contradictions that an ingestion adapter must surface:

- All 22 derived labels have inconsistent field numbering, despite matching CSV header names/order and field count. All inspected table offsets correctly identify the first data row.
- Calibrated directory 81 declares 12,993 records but has 13,496; directory 155 declares 12,993 but has 14,576. Do not truncate CSVs to the declared count.
- Directory `00096` repeats directory 79's UTC, sol and SCLK metadata despite its different filename identity. Quarantine its absolute timing pending resolution; relative-time diagnostic replay remains possible with a warning.
- `run_id` repeats between directories 55/60 and 96/100. It is not a safe primary key. Use product LIDVID and source row/segment identity; elapsed time is unique only within a verified segment.
- Label stop minus label start disagrees with the elapsed-array span by 31 seconds in directory 176 and 162 seconds in 631. Preserve both claims and flag disagreement rather than stretching samples to fit endpoints.
- Directory 631 starts on sol 630 according to labels/errata. Do not derive local Mars date from the folder name.
- Sol 901 has 7,923 raw/calibrated rows, including 14 nonzero fault-count rows with `SW_LAST_FAULT=6`, but **no derived table**. Both raw and calibrated `SW_TIME` reset from 7,517 to 0 between data rows 7,518 and 7,519 (one-based, excluding the header). The two segments have 7,518 and 405 rows; 405 elapsed values repeat across segments. These are repeated counter values, not proof of duplicate physical observations. Do not sort/deduplicate by elapsed time, infer UTC through the reset, or join segments on elapsed time alone. Fault fields clear across this boundary, but the reset's cause is not diagnosed here. A fault code needs its documented interpretation; it is not a license to invent an oxygen result.

### Field meanings and descriptive statistics

`F_O2_I_G_HR` is an **archive mathematical derivative of stack currents**, not independent oxygen-flow measurement. `TT/TB` are top/bottom SOXE heater-carrier temperatures, not air temperatures. `P1_cal` is pressure at the HEPA-filter exit, not a MEDA ambient-pressure series. `P4_cal` is an internal cathode-side pressure. The 28 V bus voltage is not battery state of charge.

The table pools all acquired samples at the stated level, including warmup, idle and diagnostic periods. Runs with more records contribute more weight. These are archive descriptions, not equipment limits or confidence intervals.

| Field (level; unit)                                      | Finite/non-sentinel n | Missing/N/A % |       Min |        p5 |       Mean |    Median |    Sample SD |       p95 |       Max |
| -------------------------------------------------------- | --------------------: | ------------: | --------: | --------: | ---------: | --------: | -----------: | --------: | --------: |
| `F_O2_I_G_HR` (derived; g/h)                             |               228,069 |             0 |         0 |         0 |    1.93003 |         0 |      3.00734 |    7.0131 |    12.116 |
| `P_TOT_W` (derived; W)                                   |               228,069 |             0 |    11.819 |    13.044 |    179.137 |   206.410 |      75.9068 |   281.710 |   375.620 |
| `F_S_P4_G_HR` (derived; g/h)                             |               228,069 |             0 |         0 |         0 |    20.9152 |         0 |      30.7162 |    79.934 |    87.614 |
| `ETA_SC_V` (derived; dimensionless)                      |                74,895 |        67.161 |   0.94389 |   0.94390 |   0.943923 |   0.94393 | 0.0000147152 |   0.94394 |   0.94400 |
| `CCASR_T` (derived; ohm cm²)                             |                72,799 |        68.080 |   -147.09 |  0.888477 |   0.980342 |   1.03690 |      2.58232 |   1.11020 |    146.55 |
| `TT` (calibrated; °C)                                    |               235,992 |             0 |    10.392 |    128.87 |    684.620 |    819.93 |      235.116 |    848.33 |    861.55 |
| `TB` (calibrated; °C)                                    |               235,992 |             0 |    16.163 |    134.95 |    681.947 |    821.03 |      236.724 |    846.96 |    858.94 |
| `IT` (calibrated; A)                                     |               235,992 |             0 | 0.0087447 |  0.010202 |   0.631484 |  0.010202 |     0.992087 |    2.3494 |    4.0225 |
| `IB` (calibrated; A)                                     |               235,992 |             0 |  0.010202 |  0.010202 |   0.632762 |  0.010202 |     0.994874 |    2.3494 |    4.0954 |
| `V28VM` (calibrated; V)                                  |               235,992 |             0 |    28.054 |    29.245 |    30.6408 |    30.859 |     0.818474 |    31.812 |    32.559 |
| `P1_cal` (calibrated; bar)                               |               235,992 |             0 |  0.005940 | 0.0061851 | 0.00727103 | 0.0073735 |  0.000536368 | 0.0079837 | 0.0096549 |
| `P4_cal` (calibrated; bar)                               |               235,992 |             0 |  0.005746 |  0.006120 |   0.194552 | 0.0074315 |     0.282392 |  0.739240 |  0.817810 |
| `CS4_MBAR_cal` (calibrated; labeled mbar, caution below) |               226,749 |         3.917 |   -51.153 |   -36.116 |    187.078 |    18.715 |      288.657 |   682.400 |    1164.1 |

For the **active cohort**, n = 72,799 seconds, or 31.92% of derived rows: oxygen mean 6.046500 g/h, median 5.9647, sample SD 1.855664, p5 2.9845, p95 9.7801 and maximum 12.116. The all-row mean of 1.93003 g/h answers a different question and must not be presented as steady production capacity.

### Run comparison and integrated quantities

Positive-production runs are shown below. Six other derived runs, directories 4, 12, 15, 55, 79 and 96, have zero production, not missing oxygen. Means here use positive/active seconds only; energy includes the **whole recorded run**, including warmup.

| Run directory | Records | Active seconds | Active mean g/h | Peak g/h | Integrated O2 g | Final archive energy Wh |
| ------------- | ------: | -------------: | --------------: | -------: | --------------: | ----------------------: |
| 60            |  13,286 |          3,541 |          5.4855 |   6.0908 |          5.3956 |                  626.13 |
| 81            |  13,496 |          4,442 |          5.6018 |   7.9746 |          6.9120 |                  669.95 |
| 100           |  13,308 |          4,261 |          5.8398 |   7.9746 |          6.9121 |                  654.03 |
| 155           |  14,576 |          5,761 |          5.5737 |   5.9951 |          8.9195 |                  754.12 |
| 176           |  13,693 |          4,922 |          5.9408 |   6.9936 |          8.1224 |                  678.96 |
| 242           |  13,243 |          4,441 |          5.5617 |   7.6113 |          6.8610 |                  665.41 |
| 276           |  13,247 |          4,441 |          5.4875 |   7.2415 |          6.7695 |                  663.82 |
| 317           |  13,244 |          4,441 |          5.4539 |   7.0218 |          6.7280 |                  662.75 |
| 444           |  14,656 |          5,791 |          5.5383 |   7.5526 |          8.9090 |                  764.76 |
| 467           |  13,960 |          5,132 |          5.5903 |   7.7027 |          7.9692 |                  704.78 |
| 535           |  12,993 |          4,201 |          7.8010 |  10.5180 |          9.1034 |                  682.40 |
| 631           |  12,828 |          4,201 |          7.8592 |  10.6330 |          9.1712 |                  699.59 |
| 710           |  13,748 |          4,921 |          5.5043 |   6.0756 |          7.5241 |                  692.42 |
| 771           |  13,313 |          4,501 |          5.2748 |   8.9535 |          6.5950 |                  632.65 |
| 816           |  12,233 |          3,481 |          6.7600 |  11.9470 |          6.5365 |                  643.31 |
| 877           |  13,119 |          4,321 |          8.2011 |  12.1160 |          9.8436 |                  699.10 |

Summing all 22 derived runs gives **122.271995 g** and summed final archive energy **11,348.795281 Wh**, including diagnostic energy. This is consistent in rounded magnitude with NASA's published 122 g and 16 production runs [S3], not independent validation of flow or purity. NASA's article dates the last run Aug. 7, whereas the local product label starts Aug. 8 UTC; retain the label's clock and the article's wording separately until reconciled.

`P_TOT_W = P_MAIN_W + P_SOXE_W`, to a maximum observed rounding residual of 0.005 W. Compressor power is a component of main power: **do not add it again**. Reconstructed cumulative energy differs from the archived energy by up to approximately 0.105 Wh; retain this discrepancy rather than forcing equality or claiming full numerical replication. Wh/g must include its chosen run boundary and is undefined when oxygen output is zero; it is not thermodynamic efficiency.

### Calibration and validity limits

- `F_O2_I_G_HR` follows the SIS current-based relation, approximately `((IT + IB) / 2) / 0.335`, with supply/setpoint gating [S2, section 7.1.3.7]. A correlation with current would largely restate its construction.
- Use `F_S_P4_G_HR`, not `F_S_FM_G_HR`, for future flow inspection: release notes describe aliasing in the flowmeter-based channel. P4-derived flow also contains the oxygen-rate term, so its correlation with oxygen is not independent evidence of causation.
- `-1` is a documented N/A sentinel for Nernst potentials, conversion-corrected ASR and compressor efficiency. The 67-68% N/A values in the table are not a sensor dropout rate.
- Corrected CS4 has 9,243 blanks among 235,992 calibrated rows (3.916658%). There are 96,868 negative corrected values among the 228,069 rows with derived companions. These finite negatives were not filled or clamped. There are also 447 negative, non-sentinel top-stack CCASR values.
- CS4 definitions conflict: the SIS table labels uncorrected `CS4_MBAR` as microbar and corrected as millibar; the XML labels both mbar. Release notes also discuss incomplete composition calibrations. The raw numeric corrected-CS4 statistics above document the archive, **not validated partial pressure or oxygen purity**. Do not infer purity from `CS4/P5`, display a verified 98% gauge, or convert units by guessing. NASA's mission-level purity statement [S3] is contextual, not a per-sample purity measurement verified here.
- Compressor volumetric efficiency is equation-derived, not overall electrical-to-oxygen efficiency. Narrow observed values do not validate an independently measured efficiency model.

### Scientifically bounded correlations

For each positive-production run, divide elapsed seconds into nonoverlapping `floor(T/60)` bins, retain bins with at least 30 active samples, take each variable's median over the same active rows, and compute Pearson r over paired bin medians. No interpolation, cross-run pooling or timestamp matching across spacecraft is used.

| Directory | Bins | Oxygen vs total power r | Oxygen vs internal TT r | Oxygen vs filter-exit P1_cal r |
| --------- | ---: | ----------------------: | ----------------------: | -----------------------------: |
| 60        |   59 |                  0.0581 |                  0.1754 |                        -0.2226 |
| 81        |   74 |                  0.5902 |                 -0.3346 |                         0.2469 |
| 100       |   71 |                  0.7638 |                 -0.5508 |                        -0.5106 |
| 155       |   96 |                  0.7766 |                  0.0543 |                         0.2016 |
| 176       |   82 |                  0.6707 |                  0.0888 |                        -0.0862 |
| 242       |   74 |                  0.5635 |                  0.1860 |                         0.1919 |
| 276       |   74 |                  0.6338 |                 -0.0574 |                         0.0607 |
| 317       |   74 |                  0.8758 |                  0.0530 |                         0.1358 |
| 444       |   96 |                  0.4580 |                  0.2438 |                         0.4647 |
| 467       |   85 |                  0.4742 |                  0.1335 |                        -0.2452 |
| 535       |   70 |                  0.8378 |                  0.8126 |                        -0.4207 |
| 631       |   70 |                  0.8767 |                  0.8130 |                        -0.4171 |
| 710       |   82 |                  0.3819 |                  0.0145 |                        -0.0330 |
| 771       |   75 |                  0.7995 |                 -0.3864 |                        -0.6502 |
| 816       |   58 |                  0.7247 |                  0.5998 |                         0.0015 |
| 877       |   72 |                  0.8730 |                  0.7285 |                        -0.1577 |

These describe controlled engineering sequences. Power and oxygen share electrical inputs; setpoints, warmup, control schedules and autocorrelation confound associations. Binning does not make observations independent. Changing signs across runs refute a simple universal temperature/pressure predictor. No causal interpretation, significance tests, learned forecast, weather-performance law or atmospheric-pressure claim is justified. MEDA/REMS correlations are unavailable; the 2012 RAD interval does not overlap the 2021-2023 MOXIE runs.

## RAD

### Current RAD companion release (2026-11-14)

The checkout now retains two Curiosity RAD Level 2 daily CDFs from NASA SPDF (CDAWeb dataset `MSL_RAD_OBS-L2`): `msl_rad_obs-l2_2023157_v05` (Curiosity sol 3850) and `msl_rad_obs-l2_2023158_v06` (sol 3851). They cover the MEDA sol-816 span and the sol-816 MOXIE run (2023-06-06T15:19Z to 18:43Z) by **UTC**. Provenance is in `data/telemetry/msl_rad_l2/sources.json`. SPDF publishes no checksums, so SHA-256 was recorded at acquisition, and two independent downloads were byte-identical. Each file's `Start_time` equals its first `EPOCH`, so epochs are treated as observation **starts**.

There are 169 observations, with a median spacing of 1,026 s (range 359 to 1,166 s). Unflagged alive times are 925.4 to 926.8 s. `FLAGGED_DATA` marks six commanding (`Cmds`) observations and three DAN-firing (`DAN`) observations. The source says flagged data should be removed for science, so their dose rates are withheld. One commanding observation (2023-06-06T04:32:32Z) has a negative source value (-28.6 µGy/day). Fourteen observations start inside the MOXIE window; one of them is flagged.

| Usable rate, µGy/day (L2 unit) |   n | Masked |    Min | Median |   Mean |   SD |    Max | Mean, µGy/h |
| ------------------------------ | --: | -----: | -----: | -----: | -----: | ---: | -----: | ----------: |
| Total Dose B (silicon)         | 160 |      9 | 180.47 | 194.00 | 195.41 | 8.40 | 218.65 |       8.142 |
| RTG Corrected Dose B (silicon) | 160 |      9 | 121.25 | 134.79 | 136.19 | 8.40 | 159.44 |       5.675 |
| Total Dose E (tissue-eq.)      | 160 |      9 | 187.69 | 193.56 | 193.80 | 2.76 | 202.99 |       8.075 |

The two days are a quiet galactic-cosmic-ray background with no solar particle event. These are absorbed dose rates at Gale crater, about 3,800 km from Jezero. The unsupported uses listed at the end of this section still apply: no relocation to Jezero or the base, no dose equivalent, no crew exposure and no thresholds. Dosimetry time slices, LET spectra and neutral histograms are present in the CDFs but not ingested.

### Historical PDS3 snapshot (removed by the cleanup)

The detached label identifies `RAD_RDR_2012_220_02_25_0001_V00`. There are 14 observation blocks, from 2012-08-07 02:25:43 UTC to a final **start** at 06:03:10 UTC. Label stop is `UNK`. The hierarchical product also includes counters, histograms and event-related sections; these were inspected structurally but not promoted into a fully calibrated spectrum or LET analysis.

Inline labels for `DOSIMETRY_TOTAL_DOSE_B` and `_E` specify **microGray/hour**. Despite “TOTAL_DOSE” in the name these scalars are rates, not accumulated dose or sieverts. B is a silicon detector and E a plastic scintillator [S4]; they are separate detector responses, not two interchangeable estimates to average into human exposure.

| Rate, µGy/h |   n | Missing/nonfinite |     Min |       p5 |     Mean |   Median | Sample SD |      p95 |     Max |
| ----------- | --: | ----------------: | ------: | -------: | -------: | -------: | --------: | -------: | ------: |
| B           |  14 |                 0 | 7.25298 | 8.095666 | 8.925000 | 8.995665 |  0.583941 | 9.559061 | 9.86733 |
| E           |  14 |                 0 | 7.05845 | 7.986962 | 8.583911 | 8.666150 |  0.459011 | 8.900531 | 8.93606 |

Start spacings have median 983 s, minimum 332 s and maximum 1,902 s. Counter duration fields are 960 s, but these are not a verified common dosimetry integration interval. Twelve of 13 spacings exceed 960 s and the last is shorter. Do not integrate using start differences or assume a continuous full-sol exposure.

All coordinates are zero and all QC strings are `00000000`. The contemporaneous SIS explicitly describes position and QC as **placeholders** [S4, section 4.2.1.2]. Although intended bits are documented (bit 0 unknown quality, bit 2 DAN mode, bit 3 solar-event mode), an all-zero placeholder is not a passed quality assessment. RAD counter values `-1` and `-2` mean inactive and missing/not applicable, respectively; do not treat them as negative physical counts.

`START_OBS_MARS` advances through `0001 11:37:00` to `0001 11:37:13` while UTC advances hours. Do not use that sequence as a reliable LMST axis without reconciliation. Official errata and timing-error listings warn of historical timing errors and redundant products [S5]. The local UTC starts are increasing with no duplicates, but that is not proof of absolute timing accuracy.

Permissible use is a small historical detector-rate context panel with explicit date, detector and timing caveats. Unsupported uses include Jezero relocation, astronaut dose equivalent, dose-to-risk conversion, shielding benefits, solar-storm prediction, daily extrapolation and operational thresholds. Converting Gy to Sv requires radiation weighting/LET and relevant tissue/exposure context that this scalar subset does not supply.

## REMS

`bundle_msl_rems.xml` describes the Curiosity REMS archive and references its collections. It contains no local temperature, pressure, wind, humidity or UV sample series. No REMS measurement count, environmental range, cadence, missingness or correlation can be reported. Its different rover/site/time must remain distinct from Mars 2020 even after actual products are obtained.

## Evidence gaps and sources

Next acquisitions should be bounded and approved: matched MEDA derived measurement files and XML labels; documented time/calibration resolution for flagged MOXIE products; RAD supporting formats/current calibration context and verified dosimetry windows; REMS measurements only if Gale weather comparison is genuinely needed. Large downloads remain approval-gated.

Separately missing are crew demand profiles, storage volume/pressure/temperature, battery capacity/efficiencies/limits, habitat loads/leaks/scrubbing, route travel models, terrain samples, reserve policy and a selected mission base. These are simulation inputs, not values recoverable from rover telemetry. Base location is a preset in the proposed mission configuration, not implicitly the rover position or permanently Jezero.

Final verification reproduced all 13 field-statistic rows, the 72,799-sample active cohort, oxygen/energy totals and RAD summaries from the original tables. Authored Markdown formatting and local links pass; application lint, typecheck, both API tests and production build pass (the build emits upstream bundler warnings). `nix run .#check` stops at formatter syntax errors in the downloaded `Mars2020_moxie_Labels_sort_pds.html` and `Mars2020_moxie_Labels_sort_vicar.html`. Those immutable source documents were not repaired or reformatted. No telemetry service or end-user telemetry E2E exists to test in this research-only change.

Sources inspected on 2026-11-14:

- **S1:** [MEDA archive readme](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/readme.txt), [derived collection](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/), and [calibrated collection](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/).
- **S2:** [MOXIE archive](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/moxie_bundle/), local SIS v7.0 (field definitions and equations, sections 6-7), XML labels, collection inventories, and [release notes](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/moxie_bundle/document/MOXIE_Release_Notes.txt).
- **S3:** [NASA: MOXIE completes Mars mission](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/), published 2023-09-06.
- **S4:** [RAD RDR SIS v3.2](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DOCUMENT/RAD_RDR_SIS.HTM), especially detector descriptions, dose/dose-equivalent glossary and section 4.2.1; local detached label and product.
- **S5:** [RAD archive](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/), [errata](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/ERRATA.TXT), and [timing errors](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DOCUMENT/TIMING_ERRORS.TXT). General warnings are not a specific correction to the local product.
