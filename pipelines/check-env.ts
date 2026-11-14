// Confirms the pipeline toolchain: GDAL is installed and PROJ knows the Mars 2000 sphere.
import { execa } from "execa";

const MARS_2000_RADIUS_M = 3396190;

const { stdout: version } = await execa("gdalinfo", ["--version"]);
const { stdout: proj } = await execa("gdalsrsinfo", ["IAU_2015:49900", "-o", "proj4"]);

if (!proj.includes(`+R=${MARS_2000_RADIUS_M}`)) {
  throw new Error(`IAU_2015:49900 is not the Mars 2000 sphere: ${proj.trim()}`);
}
console.log(`${version}\nMars 2000 sphere OK: ${proj.trim()}`);
