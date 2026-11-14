---
name: operational-ui-standards
description: Apply strict display, interaction, and accessibility rules when building or reviewing the UI of operational software, meaning tools where people monitor live data, issue commands, follow procedures, or plan time-critical work (mission control, telemetry dashboards, EVA or route planners, control panels). Use when writing, changing, or auditing screens, components, alerts, or data displays for such a tool. Not for marketing pages, blogs, or general consumer apps.
requires: []
---

# operational-ui-standards

## Entry conditions

Use this skill when the UI under work is used to **monitor, command, or plan operations**, where a misread value or a mistaken click has real consequences. Signals: live or periodically refreshed data, thresholds and limits, commands that change system state, procedures, timers, alerts.

Don't use it for a landing page, docs site, blog, or a general consumer app that only shares a keyword such as "dashboard" or "mission". For those, apply ordinary accessibility practice and stop here.

## Inputs

- The screens, components, or diff in scope.
- **Viewing distance** of the primary display. You need it to turn angular text sizes into real sizes. If it's unknown, assume 600 mm for desktop and 400 mm for handheld, and state the assumption in the output.
- **Color table**, if the project has one. If it doesn't, use the reserved meanings in [Color](#9-color) and flag any other meaningful color as needing a table entry.
- **Alert levels** used by the system. If none are defined, use the four levels in [Alerts](#11-alerts). If the project names its levels differently, use its names and map them onto AL-1 by priority.

If an input can't be found or assumed, say which rules couldn't be checked. Don't report them as passing.

## Output contract

- **Build mode:** produces UI code or a design that satisfies every **MUST** rule below. Any **SHOULD** rule left unmet is listed with a one-line reason.
- **Review mode:** produces a findings list. Each finding gives the rule ID, location (file and line, or screen and element), what's wrong, and the concrete fix. A finding with no fix isn't finished.
- **Does not** certify formal compliance with any external standard or regulation.
- **Does not** invent a brand palette, rewrite copy beyond what a rule requires, or change behaviour outside the UI layer.

Rule strength: **MUST** is a blocking violation. **SHOULD** is a warning that may be accepted with a stated reason.

---

## 1. Accessibility baseline

These apply to every screen, before any rule further down.

- **A-1 MUST** Every function is operable by keyboard alone. Focus order follows the visual and task order, and focus is always visible.
- **A-2 MUST** Every input, button, and icon-only control has an accessible name that assistive technology can read. Don't make placeholder text the only label: it disappears on input. Use a visible label tied to the field.
- **A-3 MUST** Non-text content that carries meaning (icons, charts, status glyphs) has a text alternative. Decorative content is hidden from assistive technology.
- **A-4 MUST** The UI respects platform accessibility settings: text scaling up to 200% without loss of content or function, high-contrast mode, and reduced-motion preferences. Under reduced motion, replace flashing and animation with a static, high-salience cue such as reverse video or a border. Don't just remove them.
- **A-5 MUST** Nothing flashes more than 3 times per second.
- **A-6 MUST** Status changes that appear without a page change (new alert, command result, validation error) are announced to assistive technology.

## 2. Information density and layout

- **L-1 MUST** Show only the information the task or decision on that screen needs. Move the rest one level down. Don't just shrink it.
- **L-2 MUST** Everything needed to complete a task is on one display. If the task needs values from two screens, bring them together. Don't add a "see other tab" link.
- **L-3 MUST** Present values ready to use. If the operator would compute something (a remaining margin, a difference from a limit, a unit conversion, elapsed time), compute it and show the result.
- **L-4 MUST** Vertical scrolling only for lists and procedures. No horizontal scrolling. When content overflows, show where the view sits and how much exists in total (e.g. "Rows 21–40 of 312", or a proportional scrollbar).
- **L-5 MUST** Each display has a unique title in the same position on every screen.
- **L-6 MUST** A persistent, always-visible region holds current time, the alert summary, messages, and connection or link status. It never scrolls away or gets covered.
- **L-7 MUST** Primary navigation sits in a menu bar at the top or bottom, in the same place on every display.
- **L-8 MUST** Any information is reachable in at most four actions from the main display.
- **L-9 MUST** Layout follows task flow. Related elements are grouped and visually separated from unrelated groups. A field that recurs across screens appears in the same position on each.
- **L-10 MUST** Selectable, static, navigation, and data-entry elements each look different from one another. An operator can tell what's clickable without hovering.
- **L-11 MUST** Appearance, placement, and interaction are consistent across the whole tool. The same action uses the same control, label, and position everywhere.
- **L-12 MUST** Pop-up and drop-down menus open next to the component they belong to and never cover critical data or the persistent region (L-6).
- **L-13 SHOULD** Order menu items by task sequence, urgency, function, or frequency. Use alphabetical order only when none of those applies.

## 3. Modes

- **M-1 SHOULD** Keep modes (edit mode, test mode, and so on) to a minimum. Where a mode would change what a control does, use a separate control.
- **M-2 MUST** Switching between simulation/test/training and live/operational requires an explicit, deliberate command. It never happens as a side effect.
- **M-3 MUST** Simulation, test, or training mode is unmistakable on every display: a persistent banner plus a distinct frame or background treatment, never a small badge alone.
- **M-4 MUST** Every element that has states or modes shows its current one.

## 4. Data values and telemetry

- **D-1 MUST** Data that is stale, missing, unavailable, or unknown is flagged as such. Never leave the last good value on screen looking current. Show the value muted, with a stale marker and its age (e.g. "4 m old"), or a dedicated placeholder such as "— NO DATA". Muted text still meets K-5.
- **D-2 MUST** Values outside operational limits are marked. Values beyond caution or warning thresholds get a yellow or red arrow showing direction, plus the color from [Color](#9-color). Off-scale values are marked as off-scale, not clipped to the scale edge.
- **D-3 MUST** Value fields have a fixed width sized for the longest legal value. On overflow, replace the content with yellow asterisks. Numeric fields keep their sign and decimal point (e.g. `-***.**`). Don't truncate silently or let the layout reflow.
- **D-4 MUST** Units are always shown, and the same kind of quantity uses the same unit everywhere in the tool.
- **D-5 MUST** Number formatting:
  - Show only as many decimal places as the task needs, and use the same count down a column.
  - Align decimal points in vertical groups. Right-align numbers, left-align text.
  - Use a leading zero below 1 (`0.42`, not `.42`). Suppress other leading zeros.
  - Always show `−` for negatives. Show `+` only where sign matters to the task.
  - Use thousands separators for values of five or more digits (`12,500`, but `4500`).
- **D-6 SHOULD** Update rate matches how fast the task needs to see change. Faster than the eye can read just adds flicker. Slower than the process changes hides events.

Bad / Good:

| Bad                                       | Good                          |
| ----------------------------------------- | ----------------------------- |
| `.5`                                      | `0.5 bar`                     |
| `-3.1415926 V` in a column of 1-dp values | `−3.1 V`                      |
| `12500m`                                  | `12,500 m`                    |
| `+21.0 °C` when sign doesn't matter       | `21.0 °C`                     |
| Last value shown normally after link loss | `21.0 °C · stale 4 m` (muted) |

## 5. Commands and irreversible actions

- **C-1 MUST** Irreversible, destructive, or hazardous actions require confirmation or two independent actions. A confirmation dialog names the specific action and target ("Delete route EVA-07?"), never "Are you sure?".
- **C-2 MUST** Safety- or mission-critical commands need at least two independent inputs (arm, then execute). The control that disarms sits to the right of or below the arm control.
- **C-3 MUST** Hazardous or irreversible controls are visually coded: a hazard-striped border, plus a distinct label. Controls that change system state look different from controls that only change the view.
- **C-4 MUST** Command dialogs show a unique name, the available options, the current setting, and the setting about to be applied.
- **C-5 MUST** Every control activation gets positive feedback: a changed value, or an explicit status of completed, running, failed, or unknown. When a downstream system must accept the command, show acceptance separately from completion.
- **C-6 MUST** Command names are distinct from one another. Don't use near-homonyms such as "Start"/"Restart" side by side. Paired commands keep a fixed order everywhere (e.g. Open/Close always in that order).
- **C-7 MUST** Buttons are labeled, the label stays visible in every state, and the button changes appearance while actuated.

## 6. Data entry

- **E-1 MUST** Fields with a required format show it before input (e.g. `YYYY-MM-DD`, `hh:mm:ss`).
- **E-2 MUST** Invalid entries are marked at the field, with a message following [Messages](#7-status-and-error-messages).
- **E-3 MUST** Text entries are left-aligned and numeric entries right-aligned, each wide enough for the longest legal value.

## 7. Status and error messages

- **S-1 MUST** Status and error messages appear in one consistent, designated location (or the persistent region, L-6), not in arbitrary toasts scattered around.
- **S-2 MUST** An error message states what's wrong, the cause if known, and what the operator can do. A message that only says something failed is incomplete.
- **S-3 MUST** Pop-ups can be moved or dismissed by the operator, or they clear themselves. They never trap the operator or cover the persistent region.
- **S-4 SHOULD** Logged messages and events are searchable, so the operator can trace an anomaly back.
- **S-5 SHOULD** Indicate when routine maintenance is due.

Bad / Good:

| Bad                    | Good                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Error 0x3F`           | `Route not saved: segment 3 crosses a no-go zone. Edit segment 3 or remove the zone overlap, then save again.` |
| `Invalid input`        | `Start time must be hh:mm:ss (24-hour). You entered "9:5".`                                                    |
| `Something went wrong` | `Forecast not loaded: weather service timed out after 30 s. Showing forecast from 14:02 (stale). Retry.`       |

## 8. Text and labels

- **T-1 MUST** Use sans-serif fonts that distinguish lookalike characters: `l`/`1`/`I`, `O`/`0`, `S`/`5`. Check a candidate font by rendering `Il1 O0 S5 B8` before adopting it.
- **T-2 MUST** Use monospaced fonts for numeric and tabular data, and proportional fonts for running text such as procedures and descriptions.
- **T-3 MUST** Character height is at least 0.25° of visual angle, ideally 0.4° or more. Compute it as `height = 2 × distance × tan(angle / 2)`. At 600 mm that's ≥ 2.6 mm minimum and ≈ 4.2 mm preferred. Labels are at least 0.4° (or 12 pt).
- **T-4 MUST** Use mixed case for text. All-caps only for acronyms, and acronyms come from one project glossary used consistently.
- **T-5 MUST** Use the same term for the same thing everywhere. Pick one of "abort / cancel / terminate" and use it throughout.
- **T-6 MUST** Labels sit with the data they name: to the left of a value, or above a column. Text runs horizontally. If vertical text can't be avoided, rotate it counter-clockwise.
- **T-7 SHOULD** Offer temporary zoom or magnification of any region.

## 9. Color

- **K-1 MUST** Color is used only to convey meaning, never as decoration on data. Neutral, low-saturation chrome keeps the reserved colors readable.
- **K-2 MUST** Reserved meanings: **red** for emergency and warning, **yellow** for caution, **blue** for advisory. Don't use these hues for anything else (no red brand buttons, no yellow highlights).
- **K-3 MUST** Any other meaningful color has an entry in the project color table. Don't add a new color for meaning ad hoc: add it to the table first.
- **K-4 MUST** Color is never the only cue for critical information. Pair it with an icon, shape, text, position, or pattern, so the meaning survives grayscale and color-vision deficiency.
- **K-5 MUST** Text-to-background contrast is at least **6:1**, ideally **10:1**, for all text including large text. This is stricter than common web baselines. Apply this one.
- **K-6 MUST** Reverse video (inverted foreground and background) is reserved for events that need immediate operator attention or action.

## 10. Flashing

- **F-1 MUST** Flashing is reserved for events that need immediate attention.
- **F-2 MUST** Two rates only: **low** (0.8 Hz, 70% on) for lower-priority text or notifications, and **high** (3 Hz, 50% on) for higher-priority non-text indicators. Never exceed 3 Hz (A-5).
- **F-3 MUST** Flashing elements on screen at the same time flash in sync.
- **F-4 MUST** Flashing text alternates between two intensities and stays legible at the lower one, meeting K-5. It never blinks fully off.
- **F-5 MUST** The operator can stop any flashing that runs longer than 10 seconds.

## 11. Alerts

Applies when the tool raises alerts.

- **AL-1 MUST** Four levels, from highest priority: **emergency** and **warning** (red), **caution** (yellow), **advisory** (blue). A project may rename the levels in its glossary (T-5). The priority order and the hue for each priority stay. Each level has a distinct visual treatment beyond color (K-4), and a distinct sound if audio is used.
- **AL-2 MUST** The persistent region (L-6) shows counts of active emergency, warning, and caution events, the count of unacknowledged events, and access to a queue of unacknowledged ones.
- **AL-3 MUST** Each event shows: priority, name, ID, timestamp, source system or module, whether it's active, whether it's annunciating, whether it's acknowledged, and details including root cause where known.
- **AL-4 MUST** Active events can be sorted by priority, time, system, module, and root cause. All events, active and inactive, can be searched by ID or name.
- **AL-5 MUST** Emergency, warning, and caution events link straight to the procedure or response for that event.
- **AL-6 MUST** Per event, the operator can acknowledge, suppress, inhibit, and re-enable. Suppressing stops the annunciation but keeps the text visible and the event logged. Inhibited alerts are listed somewhere the operator can audit them.
- **AL-7 MUST** One action silences all audible annunciations.
- **AL-8 MUST** The operator can test the visual and audio annunciators, and the result is shown.
- **AL-9 SHOULD** Audible alerts start about 10 dB below full level and ramp up, to avoid startle.

## 12. Graphs and schematics

Applies when the tool draws charts, plots, or schematics.

- **G-1 MUST** Each graph has a unique title above it. Each axis is labeled with units, tick marks are labeled, and each series is labeled directly or in a legend.
- **G-2 MUST** Historical data looks different from live data (e.g. a different line style plus a label).
- **G-3 MUST** Out-of-range values are highlighted. The operator can rescale or zoom on demand.
- **G-4 MUST** Schematics have a unique title, and every object is labeled or identifiable. Crossing lines that aren't connected have no dot; connected crossings have a dot. One flow type uses solid lines. Multiple types use distinct line styles, named in a legend. Add arrows wherever flow direction isn't obvious from the layout.

## 13. Icons

- **I-1 MUST** Use widely recognized icons from one project icon library. Each icon is visually distinct from the others, and an icon means the same thing everywhere (see A-3 for text alternatives).

## 14. Automation and decision aids

Applies when the tool automates actions, recommends routes or decisions, or runs any model-driven suggestion.

- **AU-1 MUST** Show the current automation level, the state of each automated process, and who is responsible for each task right now: the operator or the system.
- **AU-2 MUST** Show where control of each system currently comes from.
- **AU-3 MUST** Recommendations come with their rationale and the expected consequences of accepting them. A bare "Recommended" badge isn't enough.
- **AU-4 MUST** Before the operator overrides or shuts down automation, show what will happen as a result.
- **AU-5 MUST** When automation can't resolve a situation, or the situation is beyond what it's built for, alert the operator explicitly. Don't degrade silently.
- **AU-6 MUST** The operator can inspect the automation's inputs and configuration.
- **AU-7 MUST** Mode changes in safety-critical automation are announced to the operator.
- **AU-8 SHOULD** Provide a history of automation performance.
- **AU-9 SHOULD** Use neutral, non-anthropomorphic wording ("Route recalculated", not "I think you should go left").

## 15. Procedures

Applies when the tool presents step-by-step procedures or checklists.

- **P-1 MUST** Show the current step and which steps are complete. The operator can manually mark a step in progress or complete.
- **P-2 MUST** The operator can view earlier and later steps and add notes.
- **P-3 MUST** Notify the operator when a procedure needs attention to start or resume.
- **P-4 SHOULD** Allow steps to be inserted, deleted, or reordered in real time.

## 16. Time

Applies to every tool that shows time.

- **TM-1 MUST** Current time is always visible (L-6), in a standard format, labeled with its time system (e.g. UTC, local, mission elapsed time, or the project's own time base).
- **TM-2 MUST** Use 24-hour format, and include day count where durations span days: `ddd/hh:mm:ss`, with leading zeros suppressed in the day field only (`3/04:05:06`, not `003/4:5:6`).
- **TM-3 MUST** Timers tied to an absolute event count down through zero, then up (`−00:05:00` → `00:00:00` → `+00:05:00`).
- **TM-4 MUST** A countdown starts the moment it's commanded, with no lag between the command and the first visible tick.

---

## Review procedure

1. Classify the UI (entry conditions). If it doesn't qualify, say so and stop.
2. Gather the inputs. Record every assumption: viewing distance, color table, alert levels.
3. Check sections 1–10 and 13 on every screen in scope, and section 16 on every screen that shows time. Check sections 11, 12, 14, and 15 only where the tool has those features, and list which were skipped as not applicable.
4. For contrast (K-5), measure the actual rendered foreground and background colors of each text style, including disabled, hover, and alert states. Don't judge contrast by eye.
5. For lookalike characters (T-1), render the test string in the shipped font at the shipped size.
6. Report findings in the output-contract format, MUST findings first.
