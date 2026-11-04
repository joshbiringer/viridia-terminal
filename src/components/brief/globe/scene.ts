/**
 * The Mission Control globe: a WebGL Earth lit by the real sun, seen side-on as a horizon against
 * the sky. The camera glides along the curve of the planet from market hub to market hub; as each
 * city reaches the crest its skyline rises in silhouette, holds, and sinks as the next one arrives.
 * The canvas is transparent: the sky behind it is CSS, tinted by GlobeHero for the time of day.
 *
 * Imagery: NASA Blue Marble (day) and NASA Black Marble city lights (night), both public domain.
 * Buildings are original, generic shapes generated from a seed, not models of real skylines.
 */
import * as THREE from "three";
import { HUBS, type HubId } from "@/lib/market-sessions";
import { latLonToVec, subsolarPoint } from "@/lib/sun";

export interface GlobeOptions {
  /** Called when the flyover arrives over a new city. */
  onFocus?: (id: HubId) => void;
  /** City to start over (defaults to New York). */
  start?: HubId;
  /** Hold one still frame over the start city instead of touring. */
  still?: boolean;
}

export interface GlobeHandle {
  dispose(): void;
  /** Jump the tour to a leg and phase (used for screenshots and debugging). */
  jump(leg: number, phase: "dwell" | "travel", t: number): void;
  setPaused(paused: boolean): void;
}

// Tour order follows the trading day around the world.
const TOUR: HubId[] = ["ny", "sf", "tokyo", "hongkong", "frankfurt", "london"];
const TRAVEL_S = 7; // seconds gliding between cities
const DWELL_S = 6; // seconds with a city on the crest
const CAM_DIST = 2.75; // camera distance from Earth's center (radius 1)
const CAM_ELEV = 0.66; // radians: how far above the local horizontal the camera sits
const ATMOS_R = 1.06;
const SUN_DIST = 60;

const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ------------------------------------------------------------------------------------------ shaders */

const EARTH_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FS = /* glsl */ `
uniform sampler2D dayTex;
uniform sampler2D nightTex;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = dot(n, sunDir);

  vec3 day = pow(texture2D(dayTex, vUv).rgb, vec3(2.2));
  vec3 nt = texture2D(nightTex, vUv).rgb;

  // Sunlight: soft terminator with a warm band where the sun is on the horizon.
  float lit = smoothstep(-0.08, 0.22, ndl);
  vec3 tint = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.98, 0.95), smoothstep(0.0, 0.32, ndl));
  vec3 dayCol = day * (max(ndl, 0.0) * 1.35 + 0.015) * tint;

  // Ocean glint: water is where blue clearly beats red in the day map.
  float water = smoothstep(0.015, 0.08, day.b - day.r) * (1.0 - smoothstep(0.1, 0.3, day.g));
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(n, H), 0.0), 90.0) * water * step(0.0, ndl);
  dayCol += vec3(1.0, 0.92, 0.78) * spec * 1.4;
  dayCol += vec3(0.25, 0.42, 0.75) * pow(max(dot(n, H), 0.0), 12.0) * water * 0.05 * lit;

  // City lights: the night map's warm, bright pixels, with its blue base removed.
  float lum = dot(nt, vec3(0.6, 0.35, 0.05)) - nt.b * 0.45;
  vec3 lights = smoothstep(0.035, 0.32, lum) * vec3(1.0, 0.68, 0.36) * 1.7;
  // a soft navy "earthshine" so the night side reads as ocean and land, not a hole in the sky
  vec3 nightCol = lights + day * 0.02 + vec3(0.018, 0.03, 0.06);

  vec3 col = mix(nightCol, dayCol, lit);
  col = 1.0 - exp(-col * 1.6);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const ATMOS_VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Single-scattering ray march through a thin shell: blue Rayleigh light, a forward Mie lobe around
// the sun, and reddening near the terminator. Cheap (10 samples) but physically shaped.
const ATMOS_FS = /* glsl */ `
uniform vec3 sunDir;
uniform float atmosR;
varying vec3 vWorld;
vec2 hit(vec3 o, vec3 d, float r) {
  float b = dot(o, d), c = dot(o, o) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main() {
  vec3 o = cameraPosition;
  vec3 d = normalize(vWorld - o);
  vec2 a = hit(o, d, atmosR);
  vec2 p = hit(o, d, 1.0);
  float t0 = max(a.x, 0.0);
  float t1 = a.y;
  if (p.x > 0.0) t1 = min(t1, p.x);
  if (t1 <= t0) discard;
  const int N = 10;
  float dt = (t1 - t0) / float(N);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 s = o + d * (t0 + (float(i) + 0.5) * dt);
    float r = length(s);
    float dens = exp(-(r - 1.0) / 0.011);
    float sl = dot(s / r, sunDir);
    float sunAmt = smoothstep(-0.18, 0.12, sl);
    vec3 warm = mix(vec3(1.0, 0.45, 0.2), vec3(1.0), smoothstep(-0.02, 0.28, sl));
    sum += dens * sunAmt * warm * dt;
  }
  float mu = dot(d, sunDir);
  float ray = 0.75 * (1.0 + mu * mu);
  float g = 0.8;
  float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
  vec3 col = sum * (vec3(0.22, 0.48, 1.0) * ray * 34.0 + vec3(1.0, 0.86, 0.68) * mie * 34.0);
  col = 1.0 - exp(-col);
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

const BLDG_VS = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vSized;
varying float vSeed;
varying float vUp;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vSized = position * sc;
  vUp = position.y;
  vSeed = float(gl_InstanceID);
  vNormalW = normalize(mat3(m) * (normal / max(sc, vec3(1e-6))));
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BLDG_FS = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 hubUp;
uniform float night;
uniform vec3 facade;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vSized;
varying float vSeed;
varying float vUp;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 n = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float roof = step(0.8, dot(n, hubUp));
  float ndl = max(dot(n, sunDir), 0.0);
  float sky = 0.5 + 0.5 * dot(n, hubUp);
  float dayAmt = clamp(dot(hubUp, sunDir) * 3.0 + 0.25, 0.0, 1.0);

  // each tower gets its own material: cool glass, warm stone or dark steel, at its own brightness
  float m1 = hash(vec2(vSeed, 1.7)), m2 = hash(vec2(vSeed, 9.1));
  vec3 mat = m1 < 0.45 ? vec3(0.78, 0.92, 1.12) : m1 < 0.8 ? vec3(1.12, 1.02, 0.86) : vec3(0.62, 0.66, 0.72);
  vec3 base = facade * mat * mix(0.7, 1.3, m2);
  base = mix(base, facade * 0.6 + 0.04, roof);
  vec3 col = base * (ndl * 1.25 * dayAmt + sky * mix(0.05, 0.22, dayAmt));

  // glass reflects the sky; glint toward the sun
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col += vec3(0.16, 0.26, 0.42) * fres * dayAmt * (1.0 - roof) * step(m1, 0.45);
  vec3 H = normalize(sunDir + V);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, H), 0.0), 60.0) * 0.6 * dayAmt * (1.0 - roof);

  // window grid in real units, so tall towers get more floors, not taller windows
  if (roof < 0.5) {
    vec2 f = vec2(vSized.x + vSized.z, vSized.y) / vec2(0.00062, 0.00052);
    vec2 cell = floor(f);
    vec2 inCell = fract(f);
    float pane = step(0.18, inCell.x) * step(inCell.x, 0.82) * step(0.25, inCell.y) * step(inCell.y, 0.8);
    float on = step(0.58, hash(cell + vSeed * 13.1));
    vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.75, 0.9, 1.0), step(0.85, hash(cell.yx + vSeed)));
    col += warm * pane * on * night * 1.3;
    col += vec3(0.5, 0.65, 0.8) * pane * (1.0 - night) * 0.05 * (1.0 - ndl);
  }

  // fade into the ground and add a little haze with distance
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.25, vUp));
  float dist = length(cameraPosition - vWorld);
  col = mix(col, vec3(0.32, 0.5, 0.8) * 0.25 * dayAmt, clamp(dist * 0.35 - 0.05, 0.0, 0.35));
  col = 1.0 - exp(-col * 1.5);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const SUN_FS = /* glsl */ `
uniform float time;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float core = smoothstep(0.075, 0.05, r);
  float glow = exp(-r * 9.0) * 1.6 + exp(-r * 3.2) * 0.35;
  float rays = (pow(abs(cos(a * 7.0 + time * 0.03)), 30.0) + pow(abs(cos(a * 11.0 - time * 0.02 + 1.3)), 50.0) * 0.6)
             * exp(-r * 3.0) * 0.55;
  vec3 col = vec3(1.0, 0.97, 0.9) * core * 3.0 + vec3(1.0, 0.82, 0.55) * (glow + rays);
  float edge = smoothstep(1.0, 0.7, r);
  vec3 c = col * edge;
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}`;

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Volumetric light scattering (GPU Gems 3, ch. 13): march from each pixel toward the sun through an
// occlusion buffer where the sun is white and Earth and buildings are black.
const RAYS_FS = /* glsl */ `
uniform sampler2D occ;
uniform vec2 sunUv;
uniform float strength;
varying vec2 vUv;
void main() {
  const int N = 56;
  vec2 delta = (vUv - sunUv) * (0.92 / float(N));
  vec2 uv = vUv;
  float decay = 1.0, sum = 0.0;
  for (int i = 0; i < N; i++) {
    uv -= delta;
    vec2 cuv = clamp(uv, vec2(0.0), vec2(1.0));
    sum += texture2D(occ, cuv).r * decay;
    decay *= 0.965;
  }
  vec3 col = vec3(1.0, 0.86, 0.66) * sum * (strength / float(N)) * 2.0;
  gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`;

/* ---------------------------------------------------------------------------------------- skylines */

interface Bldg { x: number; z: number; w: number; d: number; h: number; rot: number; delay: number }
interface Skyline { boxes: Bldg[]; tapers: Bldg[]; spires: Bldg[] }

// Landmark-like accents per city, in tangent-plane units (east x, north z). Generic forms only.
const ACCENTS: Record<HubId, { kind: "box" | "taper" | "spire"; x: number; z: number; w: number; h: number }[]> = {
  ny: [
    { kind: "taper", x: -0.02, z: 0.014, w: 0.008, h: 0.058 }, { kind: "spire", x: -0.02, z: 0.014, w: 0.0012, h: 0.072 },
    { kind: "box", x: 0.006, z: -0.004, w: 0.0075, h: 0.034 }, { kind: "box", x: 0.006, z: -0.004, w: 0.005, h: 0.044 },
    { kind: "spire", x: 0.006, z: -0.004, w: 0.0026, h: 0.054 },
    { kind: "box", x: 0.017, z: 0.006, w: 0.0035, h: 0.05 },
    { kind: "box", x: 0.012, z: -0.016, w: 0.007, h: 0.038 },
  ],
  london: [
    { kind: "spire", x: 0.006, z: 0.002, w: 0.009, h: 0.06 },
    { kind: "taper", x: -0.01, z: -0.006, w: 0.007, h: 0.036 },
    { kind: "box", x: -0.022, z: 0.01, w: 0.004, h: 0.03 }, { kind: "spire", x: -0.022, z: 0.01, w: 0.0045, h: 0.038 },
  ],
  frankfurt: [
    { kind: "box", x: 0.0, z: 0.0, w: 0.007, h: 0.046 }, { kind: "spire", x: 0.0, z: 0.0, w: 0.0012, h: 0.058 },
    { kind: "taper", x: 0.013, z: -0.006, w: 0.007, h: 0.04 },
    { kind: "box", x: -0.012, z: 0.008, w: 0.006, h: 0.036 },
  ],
  hongkong: [
    { kind: "box", x: -0.006, z: 0.002, w: 0.008, h: 0.062 },
    { kind: "taper", x: 0.012, z: -0.004, w: 0.008, h: 0.054 }, { kind: "spire", x: 0.012, z: -0.004, w: 0.0012, h: 0.068 },
    { kind: "box", x: 0.024, z: 0.01, w: 0.007, h: 0.05 },
  ],
  tokyo: [
    { kind: "spire", x: 0.002, z: -0.002, w: 0.009, h: 0.064 },
    { kind: "box", x: -0.014, z: 0.008, w: 0.008, h: 0.04 },
    { kind: "taper", x: 0.016, z: 0.01, w: 0.007, h: 0.036 },
  ],
  sf: [
    { kind: "spire", x: 0.004, z: 0.004, w: 0.008, h: 0.05 },
    { kind: "taper", x: -0.008, z: -0.006, w: 0.008, h: 0.048 },
    { kind: "box", x: 0.016, z: -0.008, w: 0.006, h: 0.034 },
  ],
};

function buildSkyline(id: HubId, seed: number): Skyline {
  const r = rng(seed);
  const boxes: Bldg[] = [], tapers: Bldg[] = [], spires: Bldg[] = [];
  const placed: { x: number; z: number; s: number }[] = [];
  for (const a of ACCENTS[id]) {
    const b = { x: a.x, z: a.z, w: a.w, d: a.w, h: a.h, rot: r() * Math.PI, delay: 0.15 + r() * 0.15 };
    (a.kind === "box" ? boxes : a.kind === "taper" ? tapers : spires).push(b);
    if (a.kind !== "spire" || a.w > 0.004) placed.push({ x: a.x, z: a.z, s: a.w });
  }
  // A city, not a disc: an elongated downtown, a second business district, and low sprawl that
  // thins out irregularly toward the edges.
  const axis = r() * Math.PI;
  const centers = [
    { x: 0, z: 0, sx: 0.034, sz: 0.019, peak: 1 },
    { x: Math.cos(axis + 1.9) * 0.042, z: Math.sin(axis + 1.9) * 0.042, sx: 0.016, sz: 0.012, peak: 0.55 },
  ];
  const noise = (x: number, z: number) => Math.sin(x * 160 + seed) * Math.cos(z * 140 - seed * 0.3) * 0.5 + Math.sin((x + z) * 90) * 0.5;
  let tries = 0;
  while (boxes.length + tapers.length < 150 && tries++ < 9000) {
    const c = r() < 0.78 ? centers[0] : centers[1];
    // gaussian-ish spread along the district's axis
    const g1 = (r() + r() + r() - 1.5) * 1.4, g2 = (r() + r() + r() - 1.5) * 1.4;
    const lx = g1 * c.sx * 1.6, lz = g2 * c.sz * 1.6;
    const x = c.x + lx * Math.cos(axis) - lz * Math.sin(axis), z = c.z + lx * Math.sin(axis) + lz * Math.cos(axis);
    const rad = Math.hypot(x, z);
    if (rad > 0.075 || noise(x, z) < -0.55) continue;
    const w = 0.002 + r() * 0.0032, d = 0.002 + r() * 0.0032, s = Math.max(w, d);
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 0.75)) continue;
    const dl = Math.hypot(lx / c.sx, lz / c.sz);
    const core = c.peak * Math.exp(-dl * dl * 0.9);
    const tall = r() < 0.08 * core ? 1.5 : 1;
    const h = (0.002 + (0.0025 + 0.026 * core) * (0.3 + r() * 0.9)) * tall;
    const b = { x, z, w, d, h, rot: axis + (r() < 0.8 ? 0 : r() * Math.PI), delay: Math.min(1, dl * 0.32) * 0.6 + r() * 0.12 };
    (r() < 0.08 && h > 0.014 ? tapers : boxes).push(b);
    placed.push({ x, z, s });
  }
  return { boxes, tapers, spires };
}

/* ------------------------------------------------------------------------------------------ camera */

interface Shot { eye: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 }

/**
 * The crest shot: the camera sits south of the focus point and above it, looking north across it, so
 * the focus point lies just inside the planet's limb with sky above it. Everything is continuous in
 * the focus point, so gliding it along a great circle never jumps.
 */
function crestShot(F: THREE.Vector3, out: Shot) {
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(F, -F.y);
  const south = north.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, 1) : north.normalize().negate();
  const eyeDir = F.clone().multiplyScalar(Math.sin(CAM_ELEV)).addScaledVector(south, Math.cos(CAM_ELEV)).normalize();
  out.eye.copy(eyeDir).multiplyScalar(CAM_DIST);
  // aim below the crest so the planet fills the lower part of the frame and the city sits high
  out.target.copy(F).multiplyScalar(0.7);
  out.up.copy(F);
}

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const ang = a.angleTo(b);
  if (ang < 1e-5) return out.copy(a);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * ang)).addScaledVector(b, Math.sin(t * ang)).divideScalar(Math.sin(ang)).normalize();
}

/* -------------------------------------------------------------------------------------------- main */

export async function createGlobe(canvas: HTMLCanvasElement, opts: GlobeOptions = {}): Promise<GlobeHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display-ready color

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.005, 400);

  const loader = new THREE.TextureLoader();
  const load = (url: string) => new Promise<THREE.Texture>((res, rej) => loader.load(url, res, undefined, rej));
  const [dayTex, nightTex] = await Promise.all([load("/textures/earth-day.webp"), load("/textures/earth-night.webp")]);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const t of [dayTex, nightTex]) {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }

  const sunDir = new THREE.Vector3();
  const updateSun = () => {
    const s = subsolarPoint(new Date());
    sunDir.copy(v3(latLonToVec(s.lat, s.lon)));
  };
  updateSun();

  // Earth (rotated so texture longitude matches latLonToVec: lon 0 faces +z)
  const earthGeo = new THREE.SphereGeometry(1, 256, 160);
  const earth = new THREE.Mesh(earthGeo, new THREE.ShaderMaterial({
    vertexShader: EARTH_VS, fragmentShader: EARTH_FS,
    uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, sunDir: { value: sunDir } },
  }));
  earth.rotation.y = -Math.PI / 2;
  scene.add(earth);

  const atmos = new THREE.Mesh(new THREE.SphereGeometry(ATMOS_R, 128, 96), new THREE.ShaderMaterial({
    vertexShader: ATMOS_VS, fragmentShader: ATMOS_FS,
    uniforms: { sunDir: { value: sunDir }, atmosR: { value: ATMOS_R } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  }));
  atmos.renderOrder = 2;
  scene.add(atmos);

  // Sun glow (billboard) and the bright disc used only in the occlusion pass
  const sunGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SUN_FS, uniforms: { time: { value: 0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunGlow.scale.setScalar(SUN_DIST * 0.9);
  scene.add(sunGlow);

  const occScene = new THREE.Scene();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const occEarth = new THREE.Mesh(earthGeo, black);
  occScene.add(occEarth);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(SUN_DIST * 0.035, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  occScene.add(sunDisc);
  // a soft halo so rays still stream when the disc itself sits just behind the limb
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(SUN_DIST * 0.09, 24, 16), new THREE.MeshBasicMaterial({ color: 0x404040 }));
  occScene.add(sunHalo);

  // Skylines
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const taperGeo = new THREE.CylinderGeometry(0.34, 0.5, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const spireGeo = new THREE.CylinderGeometry(0.0, 0.5, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  interface City {
    id: HubId; P: THREE.Vector3; basis: THREE.Matrix4; sky: Skyline;
    meshes: { mesh: THREE.InstancedMesh; list: Bldg[]; occ: THREE.InstancedMesh }[]; grow: number; mat: THREE.ShaderMaterial; shown: number;
  }
  const cities: City[] = HUBS.map((h, i) => {
    const P = v3(latLonToVec(h.lat, h.lon));
    const east = new THREE.Vector3(0, 1, 0).cross(P).normalize();
    const north = new THREE.Vector3().crossVectors(P, east);
    const basis = new THREE.Matrix4().makeBasis(east, P, north).setPosition(P.clone().multiplyScalar(0.999));
    const sky = buildSkyline(h.id, 101 + i * 977);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BLDG_VS, fragmentShader: BLDG_FS,
      uniforms: { sunDir: { value: sunDir }, hubUp: { value: P }, night: { value: 0 }, facade: { value: new THREE.Color(0.24, 0.27, 0.31) } },
      transparent: true,
    });
    const meshes = ([[boxGeo, sky.boxes], [taperGeo, sky.tapers], [spireGeo, sky.spires]] as const).map(([geo, list]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = false;
      mesh.renderOrder = 3; // after the additive atmosphere, so haze doesn't wash the towers out
      scene.add(mesh);
      const occ = new THREE.InstancedMesh(geo, black, Math.max(1, list.length));
      occ.instanceMatrix = mesh.instanceMatrix;
      occ.count = list.length;
      occ.frustumCulled = false;
      occScene.add(occ);
      occ.visible = false;
      return { mesh, list: list as Bldg[], occ };
    });
    return { id: h.id, P, basis, sky, meshes, grow: 0, mat, shown: -1 };
  });

  const tmp = new THREE.Matrix4(), rot = new THREE.Matrix4(), scl = new THREE.Matrix4(), off = new THREE.Matrix4();
  const easeBack = (t: number) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function placeCity(c: City) {
    if (Math.abs(c.shown - c.grow) < 1e-4) return;
    c.shown = c.grow;
    const vis = c.grow > 0.001;
    for (const { mesh, list, occ } of c.meshes) {
      mesh.visible = vis && list.length > 0;
      occ.visible = mesh.visible;
      if (!vis) continue;
      list.forEach((b, i) => {
        const k = clamp01((c.grow * 1.6 - b.delay) / 0.6);
        const hk = k <= 0 ? 0.0001 : easeBack(k);
        off.makeTranslation(b.x, 0, b.z);
        rot.makeRotationY(b.rot);
        // drawn larger than true scale so the skyline reads on the horizon from orbit
        scl.makeScale(b.w * 1.4, Math.max(0.0001, b.h * hk * 2.1), b.d * 1.4);
        tmp.copy(c.basis).multiply(off).multiply(rot).multiply(scl);
        mesh.setMatrixAt(i, tmp);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    const day = c.P.dot(sunDir);
    c.mat.uniforms.night.value = clamp01(0.6 - day * 4);
  }

  // God-ray buffers
  const occRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const raysMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VS, fragmentShader: RAYS_FS,
    uniforms: { occ: { value: occRT.texture }, sunUv: { value: new THREE.Vector2() }, strength: { value: 0 } },
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), raysMat));

  // Layout: on wide screens the subject sits right of center so the headline has room.
  let W = 1, H = 1;
  function resize() {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    // wide: subject right of center; narrow: subject low, below the headline and button
    const wide = W >= 768;
    const fullW = W * ((wide ? 0.64 : 0.5) / 0.5);
    const fullH = H * ((wide ? 0.5 : 0.8) / 0.5);
    camera.aspect = fullW / fullH;
    camera.fov = wide ? 31 : 52;
    camera.setViewOffset(fullW, fullH, 0, 0, W, H);
    camera.updateProjectionMatrix();
    occRT.setSize(Math.max(2, Math.round(W * dpr / 3)), Math.max(2, Math.round(H * dpr / 3)));
  }
  resize();

  // Tour state
  const startId = opts.start ?? "ny";
  let leg = Math.max(0, TOUR.indexOf(startId));
  let phase: "dwell" | "travel" = "dwell";
  let phaseT = opts.still ? 0.35 : 0.0;
  const shot: Shot = { eye: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };
  const focus = new THREE.Vector3();
  const cityOf = (id: HubId) => cities.find((c) => c.id === id)!;
  opts.onFocus?.(TOUR[leg]);
  if (opts.still) cityOf(startId).grow = 1;

  const sunPos = new THREE.Vector3(), clip = new THREE.Vector4();
  let elapsed = 0;
  function frame(dt: number) {
    elapsed += dt;
    if (!opts.still) {
      phaseT += dt / (phase === "dwell" ? DWELL_S : TRAVEL_S);
      if (phaseT >= 1) {
        phaseT -= 1;
        if (phase === "dwell") phase = "travel";
        else { phase = "dwell"; leg = (leg + 1) % TOUR.length; opts.onFocus?.(TOUR[leg]); }
      }
    }
    const cur = cityOf(TOUR[leg]), next = cityOf(TOUR[(leg + 1) % TOUR.length]);
    // One continuous parameter per leg: a slow creep while the city holds on the crest (the first
    // DRIFT of the way), then an eased glide for the rest. It ends exactly on the next city, where
    // the next leg starts, so there is never a cut.
    const DRIFT = 0.04;
    const u = phase === "dwell" ? DRIFT * phaseT : DRIFT + (1 - DRIFT) * smooth(phaseT);
    slerpUnit(cur.P, next.P, u, focus);
    crestShot(focus, shot);
    camera.position.copy(shot.eye);
    camera.up.copy(shot.up);
    camera.lookAt(shot.target);

    // skylines rise while we're over a city and sink as we climb away
    for (const c of cities) {
      let goal = 0;
      if (c === cur && phase === "dwell") goal = 1;
      if (phase === "travel" && c === cur && phaseT < 0.25) goal = 1;
      if (phase === "travel" && c === next && phaseT > 0.62) goal = 1;
      const rate = goal > c.grow ? 0.55 : 1.4;
      c.grow = opts.still ? goal : c.grow + Math.sign(goal - c.grow) * Math.min(Math.abs(goal - c.grow), dt * rate);
      placeCity(c);
    }

    // sun
    sunPos.copy(sunDir).multiplyScalar(SUN_DIST);
    sunGlow.position.copy(sunPos);
    sunGlow.quaternion.copy(camera.quaternion);
    (sunGlow.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;
    sunDisc.position.copy(sunPos);
    sunHalo.position.copy(sunPos);
    clip.set(sunPos.x, sunPos.y, sunPos.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    const facing = clip.w > 0 ? 1 : 0;
    raysMat.uniforms.sunUv.value.set((clip.x / clip.w) * 0.5 + 0.5, (clip.y / clip.w) * 0.5 + 0.5);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    raysMat.uniforms.strength.value = facing * smooth(clamp01((fwd.dot(sunDir) + 0.2) / 0.9)) * 0.55;

    render();
  }

  function render() {
    renderer.setRenderTarget(occRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    if (raysMat.uniforms.strength.value > 0.002) renderer.render(occScene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    if (raysMat.uniforms.strength.value > 0.002) renderer.render(quadScene, quadCam);
  }

  // Loop: runs only while visible on screen and the tab is in front.
  let raf = 0, last = 0, paused = false, onScreen = true, disposed = false;
  const loop = (t: number) => {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    frame(dt);
    raf = requestAnimationFrame(loop);
  };
  const run = () => {
    const should = !disposed && !paused && onScreen && document.visibilityState === "visible";
    if (should && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    if (!should && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const ro = new ResizeObserver(() => { resize(); if (!raf) frame(0); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; run(); });
  io.observe(canvas);
  document.addEventListener("visibilitychange", run);
  const sunTimer = setInterval(() => { updateSun(); for (const c of cities) c.shown = -1; if (!raf) frame(0); }, 60_000);

  frame(0);
  if (!opts.still) run();
  return {
    jump(l: number, p: "dwell" | "travel", t: number) {
      leg = ((l % TOUR.length) + TOUR.length) % TOUR.length; phase = p; phaseT = t;
      for (const c of cities) c.grow = c === cityOf(TOUR[leg]) && p === "dwell" ? 1 : 0;
      opts.onFocus?.(TOUR[leg]); frame(0);
    },
    setPaused(p: boolean) { paused = p; run(); },
    dispose() {
      disposed = true; run();
      ro.disconnect(); io.disconnect(); clearInterval(sunTimer);
      document.removeEventListener("visibilitychange", run);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      dayTex.dispose(); nightTex.dispose(); occRT.dispose(); raysMat.dispose(); black.dispose();
      renderer.dispose();
    },
  };
}
