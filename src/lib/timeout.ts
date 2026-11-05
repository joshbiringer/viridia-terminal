/**
 * Resolves with the promise's value, or rejects after `ms`. Server pages wrap database reads in it so a
 * slow or saturated database produces an honest "didn't load" state instead of a page that never
 * finishes rendering. The underlying request is not cancelled; it simply stops being awaited.
 */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, label = "request"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); }),
  ]);
}
