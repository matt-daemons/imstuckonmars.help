# Simulation research

## Scope and evidence boundaries

Research snapshot: 2026-11-14. These are proposed educational models, not implemented features, validated life-support designs or safety advice. The [telemetry analysis](TELEMETRY_ANALYSIS.md) establishes what the downloads actually contain.

Use three explicit provenance classes:

1. **NASA archived telemetry:** calibrated instrument channels and archive-derived outputs, with their processing level and limitations.
2. **ARES mathematical derivative:** integration, unit conversion, descriptive statistics or resource accounting using stated equations.
3. **Assumption-driven simulation:** crew, tank, battery, habitat, generation scaling, loads, reserves and events. These are configured scenario inputs, not NASA measurements.

The strongest starting point is replaying a complete MOXIE power/oxygen trace into an explicitly hypothetical resource ledger. The trace describes one instrument operating schedule, not a scalable habitat oxygen plant. A chosen mission base is a preset configuration with coordinates and evidence coverage, not a hard-coded Jezero dependency. Replaying a Jezero instrument trace at another base is an analog scenario and must be labeled as such.

Use SI internally: seconds, kg, W, J, Pa, K and meters. Expose Wh for energy and g/h for oxygen when useful, with explicit conversions: `1 Wh = 3600 J`, `1 bar = 100000 Pa`, `1 mbar = 100 Pa`, `T_K = T_°C + 273.15`. A Mars sol is not a 24-hour Earth day; preserve labeled UTC, sol and LMST separately rather than synthesizing one from another without a documented clock convention.

## Oxygen and habitat inventories

### Production and consumption

For an acquired MOXIE sample with oxygen rate `q` in g/h and supported interval `dt_s`:

```text
dm_O2_kg = q * dt_s / (1000 * 3600)
```

For the reported local total, use the inclusive one-second archive sample sum, not a different quadrature rule. Never integrate across experiment gaps. Archive oxygen is inferred from electrolysis currents; replay does not add an independent flow measurement or certify purity [M1].

Electrolysis supplies a physical plausibility relation, not an alternate calibration:

```text
2 CO2 -> 2 CO + O2
q_O2_kg_per_s = eta_F * N_eff * I_A * M_O2_kg_per_mol / (4 * F_C_per_mol)
```

`F = 96485.33212... C/mol` [M2], `M_O2` is approximately 0.032 kg/mol, `eta_F` is Faradaic efficiency and `N_eff` represents the applicable series-cell/current topology. The denominator is four electrons per O2 molecule. MOXIE's two half-stack currents and its SIS coefficient must not be replaced by a single-cell formula or guessed effective cell count. The archive's relation is approximately `((IT + IB)/2)/0.335` g/h with state gating [M1, section 7.1.3.7].

An assumed tank or habitat oxygen ledger is:

```text
dm_O2/dt = eta_capture * q_production - sum(q_crew_i) - q_leak - q_vent
m_next = m_now + integral(net_flow dt)
```

All terms in kg/s; `eta_capture` is dimensionless and must be configured, not inferred from MOXIE purity. Crew oxygen use is a time-varying assumed demand profile. No calibrated human workload or EVA oxygen-demand relationship is supplied locally. Do not silently use an Earth resting rate as a Mars EVA rate.

Require initial mass, usable capacity, capture/storage assumptions, demand schedule and reserve mass. Define transfer boundaries explicitly: production cannot simultaneously fill a tank and be counted as direct crew supply; tank-to-suit transfer reduces habitat inventory once. At capacity, report spill/vented oxygen. At depletion, record unmet demand and stop the modeled activity or mark the scenario infeasible. Simply clamping negative inventory to zero hides a conservation failure.

### Resource sufficiency and reserve

Under constant demand with `q_net = q_demand - q_supply > 0`:

```text
t_until_reserve_s = (m_available_kg - m_reserve_kg) / q_net_kg_per_s
```

If already below reserve, report a violation, not a negative countdown. If `q_net <= 0`, there is no depletion under this constant-condition model; that is not proof of indefinite habitability. For varying schedules, integrate to the first reserve crossing. Never average away startup energy, demand peaks or production downtime.

A hypothetical production multiplier `k` is a scenario assumption, not a demonstrated plant design. Do not multiply oxygen while holding power fixed or imply linear scaling is validated. Prefer replay at `k=1`; if scaling is exposed, specify both production and power scaling, include storage/compression/cooling costs as unknown or explicit assumptions, and label results sensitivity studies. MOXIE's approximately 122.27 g across separated experiments is not a continuous daily supply.

### Other habitat resources

The same mass-balance form can track assumed potable water, CO2, waste and consumables, but each needs its own units and supply/removal terms:

```text
dm_CO2/dt = sum(q_CO2_crew) + q_CO2_other - q_scrubber - q_vent_CO2
dm_water/dt = q_resupply + q_recovery - q_crew_water - q_process - q_loss
```

NASA's ECLSS overview [M3] identifies oxygen generation, CO2 removal, water recovery and air management as distinct systems. It does not supply ARES-specific capacities or validated Mars efficiencies. Oxygen inventory alone is not habitability: CO2 accumulation, pressure, thermal control, contaminants and water may independently invalidate a scenario. Do not claim a closed-loop habitat or use an assumed recycling percentage as measured performance.

## Power and battery energy

### Instrument energy

```text
E_Wh = sum(P_W * dt_s) / 3600
P_MOXIE_total = P_MAIN_W + P_SOXE_W
```

Compressor power is already part of main power. Whole-run energy includes warmup, when oxygen may be zero. A ratio `E_Wh / m_O2_g` describes specific electrical energy for the selected interval, not dimensionless thermodynamic efficiency; hide it as undefined for zero production. Do not extrapolate active-only specific energy to a complete mission without startup/shutdown boundaries.

### Assumed battery ledger

Choose one consistent bus-side power boundary. With generation `P_gen`, total loads `P_load`, usable stored energy `E_J`, charge efficiency `eta_ch`, discharge efficiency `eta_dis`, and optional self-discharge power `P_self`:

```text
P_surplus = max(P_gen - P_load, 0)
P_deficit = max(P_load - P_gen, 0)
dE_J/dt = eta_ch * P_surplus - P_deficit / eta_dis - P_self
SOC = E_J / E_usable_capacity_J
```

Efficiencies must be in `(0, 1]`, capacity positive, and SOC normalized to the explicitly chosen usable-capacity convention. Enforce charge/discharge power limits before updating energy. At full charge, report curtailed generation; at empty or a protected reserve, report unmet load or an explicit load-shedding command. Do not consume the same generation once as direct supply and again as battery charge.

For constant net deficit and negligible self-discharge:

```text
t_until_reserve_s = (E_now_J - E_reserve_J) * eta_dis / P_deficit_W
```

Illustrative arithmetic only: a fictional 100 W load for two hours uses 200 Wh at the bus; at an assumed discharge efficiency of 0.8 it removes 250 Wh from storage. These numbers are not measured ARES hardware properties or suggested equipment limits.

MOXIE's bus voltage cannot determine SOC without an identified battery chemistry, temperature, current history, capacity and calibrated estimator. The local files do not contain a habitat battery, charge controller or solar array output. Battery percent, charging forecasts and low-battery alarms must be marked simulated.

### Solar and thermal effects

A first-order hypothetical solar model is `P_solar = G_POA * area * eta_panel * f_derating`, where irradiance is W/m², area m², and efficiencies/derating dimensionless. `G_POA` requires illumination geometry and an appropriate irradiance model or measurement. Dust opacity, panel deposition and electrical efficiency are different quantities. They cannot be replaced by a generic catalog “dust” field or a rendered map color. For the initial scenario, an explicit assumed generation schedule is more defensible than an invented weather-driven solar forecast.

An optional lumped habitat thermal ledger is `C_thermal * dT/dt = P_heat + P_internal + P_solar_absorbed - Q_loss`, with heat capacity in J/K and heat flows in W. A linear `Q_loss = UA * (T_inside - T_outside)` is a simplifying assumption, not a complete low-pressure Mars radiative/conductive design. No local habitat geometry, insulation, heat transfer coefficients or weather series supports a calibrated thermal model. Defer detailed thermal control and battery temperature/aging effects.

## Pressure and atmosphere

### Habitat and tank pressure

For a fixed-volume, well-mixed, ideal-gas approximation [M4]:

```text
P_total_Pa = n_total_mol * R * T_K / V_m3
p_O2_Pa = n_O2_mol * R * T_K / V_m3
n_O2_mol = m_O2_kg / M_O2_kg_per_mol
x_O2 = n_O2_mol / n_total_mol
```

`R = 8.314462618... J/(mol K)` [M2]. Total pressure is not oxygen partial pressure. An oxygen mass balance without the other gas inventories does not establish total habitat pressure or composition. Track temperature/volume assumptions, gas-specific leakage and airlock transfers. At high storage pressure, real-gas effects may require `P V = Z n R T`; no compressibility calibration is present, so an ideal high-pressure tank should not be presented as engineering validated.

For an assumed fixed-mass, fixed-volume gas, `P2/P1 = T2/T1` in Kelvin. This is a model perturbation, not a forecast. A chosen leak rate can be integrated as a mass-flow scenario; do not invent a hole-to-flow law without geometry, upstream/downstream state and a defensible choked-flow model. No automatic oxygen concentration or pressure safety thresholds are justified by these rover data.

### Ambient Mars pressure

A locally isothermal hydrostatic approximation is:

```text
dp/dz = -rho * g
rho = p / (R_specific * T)
p(z) = p0 * exp(-(z - z0) / H)
H = R_specific * T / g
```

This is a mathematical atmosphere scenario, not a weather reconstruction. It requires reference pressure/site/elevation, temperature, gas composition, Mars gravity and valid height coordinates. It ignores tides, seasonal mass exchange, circulation and temperature gradients. MEDA catalog metadata does not provide `p0(t)`; MOXIE HEPA-exit pressure is not a substitute ambient weather grid. Do not set a universal pressure range from an assumed scale-height curve. When actual MEDA pressure arrives, preserve its site/time and sampling gaps rather than generalizing to the entire map.

## EVA and return feasibility

### Constrained mission model

Represent a selected sortie as directed travel legs plus explicit dwell tasks and an identified preset base. For each leg, use Mars-metric length `L_m`, an assumed speed `v_m_per_s > 0`, and a documented slope/terrain/load adjustment only where supported:

```text
t_leg_s = L_m / v_m_per_s
m_O2_required = integral(q_crew + q_leak - q_portable_supply) dt
E_required_J = integral(P_portable_load / eta_dis) dt
```

A simple constant-rate suit model can bound duration with:

```text
t_resource_bound = min(t_O2_to_reserve, t_energy_to_reserve,
                       configured_CO2_capacity_time, configured_other_limits)
```

Only include known/configured terms. An unknown CO2-removal limit is **unknown**, not infinity, and prevents a claim of overall life-support sufficiency. Speed, workload, portable power, suit storage and capacities are assumption inputs; no suit parameters are learned from MOXIE or RAD. Walking, rover driving and habitat operation are separate load profiles.

### Return margin

At every evaluated route position, estimate the **directed return** to the selected base using the same state revision, model version, allowed terrain and load assumptions. Outbound and return costs may differ. Include planned dwell, detours already selected, transfer/airlock tasks if modeled, and an explicit contingency allowance without double-counting it as both time and resource reserve.

```text
O2_margin_kg = O2_available - O2_return_required - O2_reserve
energy_margin_J = energy_available - energy_return_required - energy_reserve
time_margin_s = allowed_time_remaining - return_time - contingency_time
```

Label output **modeled return feasible under stated assumptions**, **modeled constraint violation**, or **unknown**. Require all modeled margins nonnegative, a valid path and complete required inputs before the first result. A no-path condition, masked terrain, stale route revision or unknown demand returns unknown/infeasible with a reason, never a green “safe” indicator. If time-to-reserve already includes a reserve, do not subtract that reserve again.

Reserve amounts and any warning bands must be explicit scenario policy selected by the team/user, not guessed NASA safety rules. Use named scenarios (baseline, higher assumed demand, lower assumed generation) to show sensitivity, not a fabricated survival probability or clinical risk score.

### Radiation is not a validated mission constraint

If verified intervals later become available, absorbed detector dose can be integrated as `D_Gy = integral(rate_Gy_per_s dt)` without bridging unknown gaps. The current 14 RAD observations do not establish those common intervals, a Jezero field or crew tissue dose. Dose equivalent additionally requires suitable radiation weighting/LET context. Do not add a “radiation safe time,” storm predictor, shielding multiplier or astronaut exposure ceiling from this dataset. Preserve RAD as historical instrument context.

## Validation and sources

### Inputs still needed

| Model         | Required information not supplied by these downloads                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Oxygen        | Storage, usable quantity, capture/compression power, crew demand/workload, leaks, reserves and verified composition     |
| Battery       | Usable capacity convention, initial energy, efficiencies, power limits, load schedule, temperature behavior and reserve |
| Habitat       | Volume, gas mixture, temperature, leak/airlock model, CO2 scrubbing, water and thermal capacities                       |
| Weather/solar | Actual MEDA samples/quality, site/date mapping, irradiance or atmospheric model, array orientation and deposition       |
| EVA/return    | Preset base, route geometry/terrain validity, directed speed/costs, suit limits, dwell and contingency policy           |
| Radiation     | Valid timing windows, calibration/exposure geometry, tissue/LET weighting and applicable expert-reviewed interpretation |

Validate units, finite/nonnegative required inputs, conservation and event boundaries before any UI integration. Required future tests: zero demand, zero production, production during demand, depletion within a step, capacity overflow, power-limit saturation, zero/negative timestep, gaps, reset/seek determinism, Kelvin conversion, mixed-gas partial pressure, double-counted compressor energy, asymmetric returns, no path, unknown life-support inputs and stale revisions. Substep or solve the first reserve crossing rather than advancing beyond depletion. Synthetic fixtures validate equations only, not Mars physiology or safety.

No parameter fitting, forecasting, Monte Carlo survival probabilities or AI decision system is warranted by the current evidence. Start with deterministic ledgers and transparent assumptions. All models in this report remain proposals.

Sources inspected on 2026-11-14:

- **M1:** Local MOXIE SIS v7.0, sections 6-7; [archive and release notes](https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/moxie_bundle/). See [analysis](TELEMETRY_ANALYSIS.md) for masks and calibration caveats.
- **M2:** NIST CODATA [Faraday constant](https://physics.nist.gov/cgi-bin/cuu/Value?f) and [molar gas constant](https://physics.nist.gov/cgi-bin/cuu/Value?r).
- **M3:** [NASA Environmental Control and Life Support Systems](https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/). System categories, not a Mars habitat calibration.
- **M4:** [NASA Glenn equation of state](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/equation-of-state/). Use the exact Celsius-to-Kelvin offset 273.15, not the page's approximate/erroneous conversion wording.
- Resource ledgers, battery accounting, hydrostatic derivation and return inequalities above are explicitly stated mathematical models. Their scenario parameters do not come from NASA unless individually sourced and validated later.
