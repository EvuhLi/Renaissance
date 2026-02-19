const memoryCache = new Map();
const inFlight = new Map();

const now = () => Date.now();

export async function getJSONCached(url, options = {}) {
  const {
    ttlMs = 30000,
    force = false,
    timeoutMs = 12000,
    retryOnAbort = 1,
    staleOnError = true,
    staleMaxAgeMs = 5 * 60 * 1000,
  } = options;
  const key = String(url);
  const startedAt = now();
  const current = memoryCache.get(key);
  if (!force && current && current.expiresAt > startedAt) {
    return current.value;
  }

  if (!force && inFlight.has(key)) {
    return inFlight.get(key);
  }

  const request = (async () => {
    let lastError;
    const maxAttempts = Math.max(1, Number(retryOnAbort) + 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const value = await res.json();
        memoryCache.set(key, {
          value,
          savedAt: now(),
          expiresAt: now() + Math.max(0, ttlMs),
        });
        return value;
      } catch (err) {
        lastError = err;
        const aborted = err?.name === "AbortError";
        if (!aborted || attempt >= maxAttempts) break;
      } finally {
        clearTimeout(timer);
      }
    }
    const staleSavedAt = current
      ? Number(current.savedAt || current.expiresAt || startedAt)
      : 0;
    const staleAgeMs = current ? Math.max(0, startedAt - staleSavedAt) : Number.POSITIVE_INFINITY;
    const canUseStale =
      !force &&
      !!current &&
      staleOnError &&
      (staleMaxAgeMs === Infinity || staleAgeMs <= Math.max(0, Number(staleMaxAgeMs)));
    if (canUseStale) {
      return current.value;
    }
    if (lastError?.name === "AbortError") {
      throw new Error(`Request timeout after ${Math.max(1000, timeoutMs)}ms: ${url}`);
    }
    throw lastError || new Error("Request failed");
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export function invalidateCacheByPrefix(prefix) {
  const p = String(prefix || "");
  if (!p) return;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(p)) memoryCache.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(p)) inFlight.delete(key);
  }
}
