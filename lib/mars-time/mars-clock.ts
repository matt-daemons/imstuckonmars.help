/**
 * Mars time and Sun position for a place on the surface.
 *
 * Follows NASA GISS's Mars24 algorithm (Allison and McEwen 2000). Step labels
 * such as "B-1" refer to https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
 *
 * The latitude is used as given. Mars24 expects planetographic latitude; the
 * team's data is planetocentric. The two differ by less than 0.35°.
 */

export type SurfaceLocation = {
  /** Degrees east. Either 0 to 360 or -180 to 180. */
  longitude_east_degrees: number;
  latitude_north_degrees: number;
};

export type MarsClockReading = {
  /** Sols since landing. The landing sol is sol 0, and the sol changes at local midnight. */
  sol: number;
  /** Local mean solar time at the location, "HH:MM:SS" on a 24-hour Mars clock. */
  lmst: string;
  /** Local true solar time, "HH:MM:SS". Follows the real Sun, so noon is when the Sun is highest. */
  ltst: string;
  /** Degrees above the horizon. Negative at night. */
  sun_elevation: number;
  /** Compass direction of the Sun, in degrees clockwise from north. */
  sun_azimuth: number;
  /**
   * Earth minutes until the Sun sets. Negative while the Sun is down, counting
   * from the last sunset. Null when the Sun does not rise or set that sol.
   */
  minutes_until_sunset: number | null;
  /** The season: the Sun's position along Mars's orbit, 0 to 360 degrees (Ls). */
  solar_longitude: number;
};

const MILLISECONDS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;
const JULIAN_DATE_OF_UNIX_EPOCH = 2440587.5;
const JULIAN_DATE_OF_J2000 = 2451545.0;
const EARTH_DAYS_PER_SOL = 1.0274912517;
export const EARTH_MINUTES_PER_MARS_HOUR = EARTH_DAYS_PER_SOL * 60;
const DEGREES_PER_HOUR = 15;

/**
 * Terrestrial Time runs ahead of UTC by 32.184 seconds plus the leap seconds
 * added so far. Dates before 1999 use the 1999 value.
 */
const LEAP_SECONDS_SINCE = [
  { utc: Date.UTC(2017, 0, 1), leapSeconds: 37 },
  { utc: Date.UTC(2015, 6, 1), leapSeconds: 36 },
  { utc: Date.UTC(2012, 6, 1), leapSeconds: 35 },
  { utc: Date.UTC(2009, 0, 1), leapSeconds: 34 },
  { utc: Date.UTC(2006, 0, 1), leapSeconds: 33 },
  { utc: Date.UTC(1999, 0, 1), leapSeconds: 32 },
];

/** The seven planetary pulls on Mars's orbit that Mars24 corrects for (step B-3). */
const ORBIT_PERTURBERS = [
  { amplitudeDegrees: 0.0071, periodYears: 2.2353, phaseDegrees: 49.409 },
  { amplitudeDegrees: 0.0057, periodYears: 2.7543, phaseDegrees: 168.173 },
  { amplitudeDegrees: 0.0039, periodYears: 1.1177, phaseDegrees: 191.837 },
  { amplitudeDegrees: 0.0037, periodYears: 15.7866, phaseDegrees: 21.736 },
  { amplitudeDegrees: 0.0021, periodYears: 2.1354, phaseDegrees: 15.704 },
  { amplitudeDegrees: 0.002, periodYears: 2.4694, phaseDegrees: 95.528 },
  { amplitudeDegrees: 0.0018, periodYears: 32.8493, phaseDegrees: 49.095 },
];

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function sinDegrees(degrees: number): number {
  return Math.sin(toRadians(degrees));
}

function cosDegrees(degrees: number): number {
  return Math.cos(toRadians(degrees));
}

/** Wraps a value into the range 0 up to (not including) `size`. */
function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function secondsTerrestrialTimeIsAheadOfUtc(utc: Date): number {
  const latestStep = LEAP_SECONDS_SINCE.find((step) => utc.getTime() >= step.utc);
  const leapSeconds = latestStep?.leapSeconds ?? 32;
  return 32.184 + leapSeconds;
}

/** Where Mars is in its orbit, and the time at Mars's prime meridian. */
function marsOrbitAt(utc: Date) {
  const julianDateUtc = JULIAN_DATE_OF_UNIX_EPOCH + utc.getTime() / MILLISECONDS_PER_DAY;
  const julianDateTerrestrial =
    julianDateUtc + secondsTerrestrialTimeIsAheadOfUtc(utc) / SECONDS_PER_DAY;
  const daysSinceJ2000 = julianDateTerrestrial - JULIAN_DATE_OF_J2000;

  // B-1 and B-2: where Mars would be if its orbit were a perfect circle.
  const meanAnomalyDegrees = 19.3871 + 0.52402073 * daysSinceJ2000;
  const fictitiousMeanSunDegrees = 270.3871 + 0.524038496 * daysSinceJ2000;

  // B-3: small pulls from the other planets.
  const perturbationDegrees = ORBIT_PERTURBERS.reduce(
    (total, perturber) =>
      total +
      perturber.amplitudeDegrees *
        cosDegrees((0.985626 * daysSinceJ2000) / perturber.periodYears + perturber.phaseDegrees),
    0,
  );

  // B-4: the correction for the orbit being an ellipse.
  const equationOfCenterDegrees =
    (10.691 + 3.0e-7 * daysSinceJ2000) * sinDegrees(meanAnomalyDegrees) +
    0.623 * sinDegrees(2 * meanAnomalyDegrees) +
    0.05 * sinDegrees(3 * meanAnomalyDegrees) +
    0.005 * sinDegrees(4 * meanAnomalyDegrees) +
    0.0005 * sinDegrees(5 * meanAnomalyDegrees) +
    perturbationDegrees;

  // B-5: the season.
  const solarLongitudeDegrees = wrap(fictitiousMeanSunDegrees + equationOfCenterDegrees, 360);

  // C-1: how far the real Sun runs ahead of or behind a steady clock.
  const equationOfTimeDegrees =
    2.861 * sinDegrees(2 * solarLongitudeDegrees) -
    0.071 * sinDegrees(4 * solarLongitudeDegrees) +
    0.002 * sinDegrees(6 * solarLongitudeDegrees) -
    equationOfCenterDegrees;

  // C-2: a running count of Mars days, and the clock time at the prime meridian.
  const marsSolDate =
    (julianDateTerrestrial - 2451549.5) / EARTH_DAYS_PER_SOL + 44796.0 - 0.0009626;
  const primeMeridianTimeHours = wrap(24 * marsSolDate, 24);

  return { solarLongitudeDegrees, equationOfTimeDegrees, marsSolDate, primeMeridianTimeHours };
}

/** Counts Mars days at one longitude. The whole number goes up by one at local midnight. */
function localSolCount(utc: Date, location: SurfaceLocation): number {
  return marsOrbitAt(utc).marsSolDate + location.longitude_east_degrees / 360;
}

function formatClock(hours: number): string {
  const secondsPerSol = 24 * 3600;
  const totalSeconds = Math.round(hours * 3600) % secondsPerSol;
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return [
    twoDigits(Math.floor(totalSeconds / 3600)),
    twoDigits(Math.floor((totalSeconds % 3600) / 60)),
    twoDigits(totalSeconds % 60),
  ].join(":");
}

/**
 * Earth minutes until sunset, from the local true solar time and the Sun's declination.
 * The Sun sets when it is as far past local noon as it was before noon at sunrise.
 */
function minutesUntilSunset(
  localTrueSolarTimeHours: number,
  latitudeDegrees: number,
  declinationDegrees: number,
): number | null {
  const cosineOfSunsetHourAngle =
    -Math.tan(toRadians(latitudeDegrees)) * Math.tan(toRadians(declinationDegrees));
  if (Math.abs(cosineOfSunsetHourAngle) > 1) {
    return null;
  }
  const sunsetHoursAfterNoon = toDegrees(Math.acos(cosineOfSunsetHourAngle)) / DEGREES_PER_HOUR;
  const hoursAfterNoon = wrap(localTrueSolarTimeHours, 24) - 12;

  const hoursUntilTodaysSunset = sunsetHoursAfterNoon - hoursAfterNoon;
  // Before sunrise, the sunset that counts is yesterday's, one Mars day earlier.
  const isBeforeSunrise = hoursAfterNoon < -sunsetHoursAfterNoon;
  const hoursUntilSunset = isBeforeSunrise ? hoursUntilTodaysSunset - 24 : hoursUntilTodaysSunset;
  return hoursUntilSunset * EARTH_MINUTES_PER_MARS_HOUR;
}

/** Reads the Mars clock and the Sun's position for one place at one moment. */
export function readMarsClock(
  utc: Date,
  location: SurfaceLocation,
  landingUtc: Date,
): MarsClockReading {
  const orbit = marsOrbitAt(utc);
  const latitudeDegrees = location.latitude_north_degrees;
  // Mars24 measures longitude westward.
  const longitudeWestDegrees = wrap(-location.longitude_east_degrees, 360);

  // C-3 and C-4: clock time here, by a steady clock and by the real Sun.
  const localMeanSolarTimeHours = wrap(
    orbit.primeMeridianTimeHours - longitudeWestDegrees / DEGREES_PER_HOUR,
    24,
  );
  const localTrueSolarTimeHours = wrap(
    localMeanSolarTimeHours + orbit.equationOfTimeDegrees / DEGREES_PER_HOUR,
    24,
  );

  // C-5 and D-1: the point on Mars directly under the Sun.
  const subsolarLongitudeWestDegrees = wrap(
    orbit.primeMeridianTimeHours * DEGREES_PER_HOUR + orbit.equationOfTimeDegrees + 180,
    360,
  );
  const declinationDegrees =
    toDegrees(Math.asin(0.42565 * sinDegrees(orbit.solarLongitudeDegrees))) +
    0.25 * sinDegrees(orbit.solarLongitudeDegrees);

  // D-5 and D-6: where the Sun is in the sky from here.
  const hourAngleDegrees = longitudeWestDegrees - subsolarLongitudeWestDegrees;
  const zenithAngleDegrees = toDegrees(
    Math.acos(
      sinDegrees(declinationDegrees) * sinDegrees(latitudeDegrees) +
        cosDegrees(declinationDegrees) * cosDegrees(latitudeDegrees) * cosDegrees(hourAngleDegrees),
    ),
  );
  const azimuthDegrees = toDegrees(
    Math.atan2(
      sinDegrees(hourAngleDegrees),
      cosDegrees(latitudeDegrees) * Math.tan(toRadians(declinationDegrees)) -
        sinDegrees(latitudeDegrees) * cosDegrees(hourAngleDegrees),
    ),
  );

  return {
    sol: Math.floor(localSolCount(utc, location)) - Math.floor(localSolCount(landingUtc, location)),
    lmst: formatClock(localMeanSolarTimeHours),
    ltst: formatClock(localTrueSolarTimeHours),
    sun_elevation: 90 - zenithAngleDegrees,
    sun_azimuth: wrap(azimuthDegrees, 360),
    minutes_until_sunset: minutesUntilSunset(
      localTrueSolarTimeHours,
      latitudeDegrees,
      declinationDegrees,
    ),
    solar_longitude: orbit.solarLongitudeDegrees,
  };
}
