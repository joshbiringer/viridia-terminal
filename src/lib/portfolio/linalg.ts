/**
 * Small, dependency-free linear algebra for Portfolio X-Ray: covariance, least squares with standard
 * errors, symmetric eigen-decomposition (Jacobi) and returns-based style weights on the simplex.
 * Sizes here are at most ~100 × 100, so plain O(n³) methods are fine.
 */
export type Vec = number[];
export type Mat = number[][];

export const mean = (x: Vec) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : NaN);

/** Sample covariance matrix of the columns of `rows` (rows = observations). */
export function covariance(rows: Mat): Mat {
  const n = rows.length, k = rows[0]?.length ?? 0;
  const m = Array.from({ length: k }, (_, j) => mean(rows.map((r) => r[j])));
  const c: Mat = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const r of rows) for (let i = 0; i < k; i++) {
    const di = r[i] - m[i];
    for (let j = i; j < k; j++) c[i][j] += di * (r[j] - m[j]);
  }
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) { c[i][j] /= Math.max(1, n - 1); c[j][i] = c[i][j]; }
  return c;
}

export const matVec = (a: Mat, x: Vec) => a.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
export const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
export function solve(a: Mat, b: Vec): Vec | null {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-14) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

export function invert(a: Mat): Mat | null {
  const n = a.length;
  const cols: Vec[] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0); e[j] = 1;
    const x = solve(a, e);
    if (!x) return null;
    cols.push(x);
  }
  return a.map((_, i) => cols.map((c) => c[i]));
}

export interface OlsResult { coef: Vec; se: Vec; t: Vec; r2: number; n: number }

/** Ordinary least squares y = α + X β, returning [α, β…] with standard errors, t-stats and R². */
export function ols(y: Vec, x: Mat): OlsResult | null {
  const n = y.length, k = (x[0]?.length ?? 0) + 1;
  if (n <= k + 5) return null;
  const X = x.map((r) => [1, ...r]);
  const xtx: Mat = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i] * y[t], 0));
  const inv = invert(xtx);
  if (!inv) return null;
  const coef = matVec(inv, xty);
  const resid = X.map((r, t) => y[t] - dot(r, coef));
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const my = mean(y);
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const s2 = sse / (n - k);
  const se = inv.map((r, i) => Math.sqrt(Math.max(0, r[i] * s2)));
  return { coef, se, t: coef.map((c, i) => (se[i] > 0 ? c / se[i] : 0)), r2: sst > 0 ? 1 - sse / sst : 0, n };
}

/** Eigenvalues and eigenvectors (columns of `vectors`) of a symmetric matrix, cyclic Jacobi. */
export function eigenSymmetric(a: Mat, sweeps = 60): { values: Vec; vectors: Mat } {
  const n = a.length;
  const m = a.map((r) => [...r]);
  const v: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let s = 0; s < sweeps; s++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(m[p][q]) < 1e-18) continue;
      const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) {
        const mkp = m[k][p], mkq = m[k][q];
        m[k][p] = c * mkp - sn * mkq; m[k][q] = sn * mkp + c * mkq;
      }
      for (let k = 0; k < n; k++) {
        const mpk = m[p][k], mqk = m[q][k];
        m[p][k] = c * mpk - sn * mqk; m[q][k] = sn * mpk + c * mqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - sn * vkq; v[k][q] = sn * vkp + c * vkq;
      }
    }
  }
  return { values: m.map((r, i) => r[i]), vectors: v };
}

/** Euclidean projection onto the simplex {w ≥ 0, Σw = 1}. */
export function projectSimplex(y: Vec): Vec {
  const u = [...y].sort((a, b) => b - a);
  let css = 0, theta = 0;
  for (let i = 0; i < u.length; i++) {
    css += u[i];
    const t = (css - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return y.map((v) => Math.max(0, v - theta));
}

/**
 * Returns-based style analysis (Sharpe 1992): the long-only, fully invested mix of the style assets
 * whose returns best track `y` (least squares on the simplex), by projected gradient descent on the
 * covariance form. Returns the weights and the share of variance explained.
 */
export function styleWeights(y: Vec, x: Mat, iters = 1500): { w: Vec; r2: number } | null {
  const n = y.length, k = x[0]?.length ?? 0;
  if (n < 60 || !k) return null;
  const rows = x.map((r, t) => [...r, y[t]]);
  const c = covariance(rows);
  const S = c.slice(0, k).map((r) => r.slice(0, k));
  const s = c.slice(0, k).map((r) => r[k]);
  const vy = c[k][k];
  if (!(vy > 0)) return null;
  // step size from the largest eigenvalue bound (trace)
  const L = 2 * S.reduce((a, r, i) => a + r[i], 0) || 1;
  let w = new Array(k).fill(1 / k);
  for (let it = 0; it < iters; it++) {
    const g = matVec(S, w).map((v, i) => 2 * (v - s[i]));
    w = projectSimplex(w.map((v, i) => v - g[i] / L));
  }
  const te = dot(w, matVec(S, w)) - 2 * dot(w, s) + vy; // tracking-error variance
  return { w, r2: Math.max(0, Math.min(1, 1 - te / vy)) };
}
