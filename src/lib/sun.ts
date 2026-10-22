/**
 * Where the sun is overhead right now: the subsolar point, from NOAA's low-precision solar position
 * formulas (accurate to well under a degree for 1950–2050, more than enough to light a globe).
 */
const D2R = Math.PI / 180;

export interface SubsolarPoint {
  /** Latitude in degrees (the solar declination), north positive. */
  lat: number;
  /** Longitude in degrees, east positive, in (−180, 180]. */
  lon: number;
}

export function subsolarPoint(date: Date): SubsolarPoint {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * D2R; // obliquity
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time (degrees); the sun is overhead where the hour angle is zero.
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = (ra / D2R - gmst) % 360;
  if (lon <= -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat: decl / D2R, lon };
}

/** Earth-fixed unit vector for a latitude/longitude, in the globe's frame (y up, lon 0 facing +z). */
export function latLonToVec(lat: number, lon: number): [number, number, number] {
  const p = lat * D2R, l = lon * D2R;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

/** 1 at local noon under the sun, 0 at the terminator, negative at night. */
export function sunElevation(lat: number, lon: number, s: SubsolarPoint): number {
  const a = latLonToVec(lat, lon), b = latLonToVec(s.lat, s.lon);
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
