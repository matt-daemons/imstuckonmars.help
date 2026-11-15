# Pitch notes — short lines for the slides

Speaker notes and slide footnotes, kept short. Each point names its source so it holds up under the Validity criterion.

## Ground roughness vs rock size (walking leg)

**Slide line:** "Roughness is an area average. Rock size is one rock."

- **Roughness** = how far the ground rises and falls around a smooth surface, averaged over a 5 m cell of the 1 m HiRISE elevation model.
  A cell averaging 0.25 m can still hold single bumps taller than that.
- **Rock size** = one rock, found from its shadow on 0.25 m HiRISE imagery; rocks too small to see are estimated with the
  Golombek & Rapp (1997) model.
- **Classes:** roughness 0.25 / 0.5 / 1 m; rock sizes 0.3 / 0.5 / 1 m. The 0.5 m and 1 m values match on purpose.
- **Why the lowest values differ:**
  - **0.25 m roughness:** the elevation model is only accurate to ~0.2–0.3 m (Kirk et al. 2008). Below that, "roughness" is
    measurement noise, so the lowest class reads "smooth (below DTM noise)".
  - **0.3 m rocks:** a size a suited walker steps around. Imagery doesn't have the noise floor that limits the elevation model.
- **A third 0.25 m is not the same rule:** rover parking roughness < 0.25 m (staging-point draft) comes from the Apollo rover's 36 cm
  ground clearance (NASA NSSDC). Same number by coincidence, different purpose.
- **Honesty line:** NASA has no published limit for suited walking over rough ground or rocks. These values are our assumptions
  (Role B; team sign-off pending). Nearest sourced figures: InSight lander needed rock abundance < 10 % (Golombek et al. 2017);
  MER: < 1 % of area covered by rocks > 0.5 m high.
- **Finding to pair with it:** roughness is mostly DTM noise (median 0.08–0.15 m); only crater rims and ridge flanks stand out.
  Boulder review found 0 real rocks in 109 candidates near the stops → "no boulder fields near the stops; the walking hazards are
  polygon troughs and crater walls."
