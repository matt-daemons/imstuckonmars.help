/**
 * Flight rules: the limits a walk on Mars (an EVA) is checked against.
 *
 * NASA has published no walking, suit or weather rules for Mars. Limits whose
 * `applies_to` is the Moon or the ISS are carried over, so they are assumptions
 * on Mars. Limits whose `applies_to` is "assumption" are this team's own choice.
 */
export const FLIGHT_RULES = {
  slope: {
    caution_above_degrees: 15,
    no_go_above_degrees: 20,
    applies_to: "Moon",
    source:
      "NASA xEVA concept of operations (NTRS 20200001071, slide 6): suits walk up, down and across slopes of up to 20°. Reference walks use about 12 to 16°.",
  },
  walk_back: {
    max_distance_km: 2,
    // Walking pace used to turn a distance into suit time (EVA-EXP-0042 uses 2 km/h for the walk back).
    walking_km_per_hour: 2,
    applies_to: "Moon",
    source:
      "NASA EVA-EXP-0042 Rev B, p.40: 2 km on foot at 2 km/h, which is 1 hour of backup oxygen.",
  },
  suit_supply: {
    // How long a walk is normally planned to last.
    planned_minutes: 360,
    // How long the suit's main supplies last.
    primary_minutes: 480,
    // How much of the main supply must be left on return.
    reserve_minutes: 30,
    // Planned time is multiplied by this. Real terrain took 126.5 min against 96 min on a treadmill.
    time_margin: 1.3,
    applies_to: "Moon and ISS",
    source:
      "NASA EVA-EXP-0042 Rev B, p.29 and p.36: walks of up to 8 hours, planned at 6. ISS suit timeline (NTRS 20140009556): 30 minute reserve. Time margin from a NASA field test (NTRS 20080014286).",
  },
  radiation: {
    // A flare this strong or stronger raises the alert to watch.
    watch_flare_class: "M5",
    // A solar storm arriving at Mars within this many hours, before or after, raises the alert to watch.
    storm_arrival_window_hours: 7,
    applies_to: "Earth orbit and Moon",
    source:
      "NASA radiation group action levels: flares of M5 or stronger, particle events above 10 and 100 MeV. On alert, stay within 1 hour of the lander (NTRS 20230004380). End the walk and reach shelter within 2 hours (NASA OCHMO-TB-020).",
  },
  dose_rate: {
    // Radiation dose rate measured at the surface, in micrograys per hour.
    // A quiet day is about 9. Caution is twice that, and no-go is ten times.
    caution_at_micrograys_per_hour: 18,
    no_go_at_micrograys_per_hour: 90,
    applies_to: "assumption",
    source:
      "No NASA limit exists. A quiet day at Gale crater is about 9 µGy/h (Curiosity RAD, Guo et al. 2015). The September 2017 solar event reached about 24 µGy/h and the May 2024 event about 309 (Posner et al., NTRS 20250001542).",
  },
  dust: {
    // Dust opacity is how much the dust in the air dims the Sun (optical depth, tau).
    caution_at_opacity: 1,
    no_go_at_opacity: 2,
    applies_to: "assumption",
    source:
      "No NASA limit exists. Clear sky is about 0.3 to 0.5, a regional storm at Jezero reached about 2 (Lemmon 2022), and the Opportunity rover needed below 2 to recharge.",
  },
  daylight: {
    // The walk should end at least this long before sunset.
    margin_minutes: 60,
    applies_to: "assumption",
    source: "No NASA rule exists for any mission. Back at base one hour before sunset.",
  },
} as const;

/** The name of one flight rule, such as "slope" or "dust". */
export type Factor = keyof typeof FLIGHT_RULES;
