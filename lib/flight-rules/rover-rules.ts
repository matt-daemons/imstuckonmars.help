/**
 * PROPOSED rover rules: the limits a crewed rover trip on Mars is checked against.
 *
 * NASA has no flight rules for a crewed Mars rover. These are the team's proposal
 * (docs/research/rover/proposed_rover_rules.md); ids such as C6 point to the evidence
 * tables in docs/research/rover/rover_guidelines_research.md. Role A owns flight rules
 * and may change any value.
 */
export const ROVER_RULES = {
  slope: {
    // Steepest cell slope on the 463 m MOLA terrain, which reads slopes low.
    caution_above_degrees: 5,
    no_go_above_degrees: 10,
    applies_to: "assumption",
    source:
      "Rovers climb about 20° on firm ground (R1, R32), but MOLA slopes read 6.4° below HiRISE (Wang & Wu 2017, ISPRS XLII-3-W1 p.155, T27, https://isprs-archives.copernicus.org/articles/XLII-3-W1/155/2017/isprs-archives-XLII-3-W1-155-2017.pdf) and MSL kept to 5° over 200–500 m (MSL Landing Site Engineering Constraints 2006, §1.5, R29, https://marsoweb.nas.nasa.gov/landingsites/msl/memoranda/MSL_Eng_User_Guide_v2.pdf). So both limits are halved.",
  },
  battery: {
    // Charge left after the hardest sol of driving, in percent of the battery.
    caution_below_percent: 30,
    no_go_below_percent: 20,
    applies_to: "Mars crewed study",
    source:
      "DRA 5.0 Addendum (NASA/SP-2009-566-ADD, 2009, Table 6-18 notes, D15, https://www.nasa.gov/wp-content/uploads/2015/09/373667main_nasa-sp-2009-566-add.pdf): 70% depth of discharge. COMPASS rover (NASA/TM-20220006678, 2022, §4.1.2, G3, https://ntrs.nasa.gov/api/citations/20220006678/downloads/TM-20220006678.pdf): 80%.",
  },
  reserve: {
    // Kilometres of bad-terrain driving the energy above the battery floor still covers.
    caution_below_km: 20,
    no_go_below_km: 10,
    applies_to: "Mars crewed study",
    source:
      "Chappell, Hoffman & Bekdash 2022, Mars surface power and operations (NTRS 20210022250, §4 p.6 and §5 p.7, C2, https://ntrs.nasa.gov/api/citations/20210022250/downloads/MarsSurfacePowerOps_IEEE_final.pdf): always keep enough to drive 20 km back; 10 km in the Long Stay case.",
  },
  range: {
    // Straight-line distance from the habitat, with two rovers travelling together.
    caution_above_km: 100,
    no_go_above_km: 200,
    applies_to: "Mars crewed study",
    no_go_applies_to: "assumption", // the 100 km zone is NASA's; the 200 km hard limit is ours
    source:
      "Exploration Zone radius about 100 km; a small pressurized rover reaches about 100 km in a straight line (Toups, Hoffman & Watts 2016, NTRS 20160002369, slide 10, E1 and E5, https://ntrs.nasa.gov/api/citations/20160002369/downloads/20160002369.pdf). No NASA concept goes beyond about 200 km: two SEVs reach over 125 mi (SEV fact sheet FS-2011-08-045-JSC, O3, https://www.nasa.gov/wp-content/uploads/2015/08/464826main_sev_factsheet_508.pdf), 4 fission units 225 km (Rucker 2015, E15). Using 200 km as a hard limit is our assumption.",
  },
  trip_length: {
    caution_above_sols: 7,
    no_go_above_sols: 14,
    applies_to: "Mars crewed study",
    source:
      "DRA 5.0 (NASA/SP-2009-566, 2009, p.5 and p.36, D3, https://www.nasa.gov/pdf/373665main_NASA-SP-2009-566.pdf): sorties of up to 1 week, or 1–2 weeks. Toups, Hoffman & Watts 2016 (NTRS 20160002369, slide 10, E5): 2 weeks without resupply.",
  },
} as const;

/** The name of one rover rule, such as "battery". */
export type RoverFactor = keyof typeof ROVER_RULES;

/**
 * The rover the trip is planned for: the NASA Mars Architecture Team pressurized rover
 * (Chappell, Hoffman & Bekdash 2022, NTRS 20210022250, Table 1 and §4,
 * https://ntrs.nasa.gov/api/citations/20210022250/downloads/MarsSurfacePowerOps_IEEE_final.pdf).
 */
export const ROVER = {
  mass_kg: 6126, // 5,193 kg with 60 kWh, plus 933 kg for 140 kWh more (C5, C10)
  battery_kwh: 200, // C10
  hotel_kw: 1.85, // life support and systems, day and night (C6)
  rolling_resistance: 0.15, // lunar soil value the Mars study used; no Mars measurement exists (C4)
  drivetrain_efficiency: 0.8, // assumption: parts multiply to about 0.92 before controller losses (N7, N11)
  bad_terrain_factor: 2, // assumption: Apollo 15's worst-case prediction was 1.96× what it used (L23)
  path_factor: 1.3, // real drives run 30% longer than the planned path (DRA 5.0 p.42, D6; Ono 2016, R6)
  flat_speed_kmh: 8, // C6
  // Apollo 17 slowed to 4–5 km/h on 20° (Working on the Moon, LRV Performance, L31); the straight-line fit is ours.
  speed_loss_kmh_per_degree: 0.175,
  // Odometer km per sol on trips that recharge on the way (Rucker 2015, NTRS 20150006958, slide 11, E15).
  km_per_sol: { solar: 14, fission: 46 },
  // How far a crew can walk back to safety; past it, a breakdown means waiting for rescue (DRA 5.0 walk-back, D21, D23).
  walk_back_km: 15,
  // Night-time life support drawn from the battery: half a sol with solar; deployed fission power covers it (builder's call).
  overnight_hours: { solar: 12.3, fission: 0 },
} as const;

/**
 * Rolling resistance by ground class, from THEMIS thermal inertia (J m⁻² K⁻¹ s⁻½) on each drive cell.
 * Class breaks are those of pipelines/stable/thermal-inertia.ts (Putzig & Mellon 2007; Fergason et al. 2006).
 * No rolling resistance has ever been measured on Mars (C4), so only loose dust departs from the study's value.
 * Thermal inertia is ±20 %, describes the top few cm, comes in 100 m pixels and covers ~57 % of the area.
 */
export const GROUND = {
  loose_dust: {
    label: "fine dust / loose fines",
    below_thermal_inertia: 150,
    rolling_resistance: ROVER.rolling_resistance * ROVER.bad_terrain_factor, // 0.30
    applies_to: "assumption",
    source:
      "Our assumption: loose dust is priced as the bad terrain the reserve already assumes, 2× the study's 0.15. Apollo 15's preflight worst case for soft soil and roughness was 3.67 Ah/km against 1.87 measured (Apollo 15 Mission Report §8.2.3, L23). On Mars, loose material is what stops rovers: Spirit embedded in soft soil at Troy (Arvidson et al. 2010, JGR 115, E00F03, doi:10.1029/2010JE003633); Curiosity's wheels sank up to ~30% of their diameter in megaripple sand, with high compaction resistance and slip up to 77% (Arvidson et al. 2017, J. Field Robotics 34(3), 495–518, abstract, doi:10.1002/rob.21647).",
  },
  sand_crust: {
    label: "sand / crusted soil",
    below_thermal_inertia: 400,
    rolling_resistance: ROVER.rolling_resistance,
    applies_to: "Mars crewed study",
    source:
      "The Mars Architecture Team rover's 0.15, a lunar-soil value (Chappell, Hoffman & Bekdash 2022, NTRS 20210022250, Table 1 p.6, C4).",
  },
  firm: {
    label: "firm ground / rock",
    below_thermal_inertia: Infinity,
    rolling_resistance: ROVER.rolling_resistance,
    applies_to: "assumption",
    source:
      "Kept at the study's 0.15 rather than lowered: no Mars value exists, and on the Moon soft-to-firm soil differences 'did not appear to have materially influenced' the rover's performance (Costes, Farmer & George 1972, NASA TR R-401, p.64 and Conclusions 3 p.68, https://ntrs.nasa.gov/citations/19730008090).",
  },
  no_data: {
    label: "no thermal-inertia data",
    rolling_resistance: ROVER.rolling_resistance,
    applies_to: "Mars crewed study",
    source:
      "THEMIS has a gap here, so the cell keeps the study's 0.15 (C4). Unknown ground, not known-firm ground.",
  },
} as const;
