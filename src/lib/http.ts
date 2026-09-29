/**
 * Resilient JSON fetch for client components: a timeout, retries on network errors, 5xx and
 * non-JSON bodies (an upstream HTML error page is the usual cause of "Unexpected token <"), shape
 * validation, and a last-good copy in sessionStorage to fall back on. Callers get a typed result
 * and a user-facing message, never a raw exception text.
 */
export type FetchResult<T> =
  | { ok: true; data: T; stale: false }
  | { ok: true; data: T; stale: true; savedAt: number; reason: string }
  | { ok: false; reason: string; status: number | null };

export class HttpError extends Error {
  constructor(public status: number | null, public userMessage: string, public retryable: boolean) { super(userMessage); }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(url: string, init: RequestInit, timeoutMs: number, validate: (x: unknown) => x is T): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    throw new HttpError(null, (e as Error).name === "AbortError" ? "The request timed out." : "The network request failed.", true);
  } finally { clearTimeout(timer); }
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  if (type.includes("json")) { try { body = JSON.parse(text); } catch { body = null; } }
  if (!res.ok) {
    const msg = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null;
    throw new HttpError(res.status, msg ?? "The server couldn't answer right now.", res.status >= 500 || res.status === 429);
  }
  if (body === null) throw new HttpError(res.status, "The server sent an unreadable response.", true);
  if (!validate(body)) throw new HttpError(res.status, "The server sent incomplete data.", true);
  return body;
}

export async function fetchJson<T>(url: string, opts: {
  validate: (x: unknown) => x is T; init?: RequestInit; timeoutMs?: number; retries?: number; cacheKey?: string; maxStaleMs?: number;
}): Promise<FetchResult<T>> {
  const { validate, init = {}, timeoutMs = 12_000, retries = 2, cacheKey, maxStaleMs = 7 * 864e5 } = opts;
  let last: HttpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await once(url, init, timeoutMs, validate);
      if (cacheKey) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data })); } catch { /* storage full or blocked */ } }
      return { ok: true, data, stale: false };
    } catch (e) {
      last = e instanceof HttpError ? e : new HttpError(null, "Something went wrong loading this.", true);
      if (!last.retryable || attempt === retries) break;
      await wait(400 * 2 ** attempt + Math.random() * 200);
    }
  }
  if (cacheKey) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const { t, data } = JSON.parse(raw) as { t: number; data: unknown };
        if (Date.now() - t < maxStaleMs && validate(data)) return { ok: true, data, stale: true, savedAt: t, reason: last?.userMessage ?? "" };
      }
    } catch { /* ignore */ }
  }
  return { ok: false, reason: last?.userMessage ?? "Something went wrong loading this.", status: last?.status ?? null };
}
