import { makeCacheKey, getCached, setCached } from "../cache/cacheService.js";

/**
 * Cache a public GET JSON API response for 15 minutes by default.
 * Do not use for endpoints requiring user identity, cookies, or Authorization.
 */
export async function fetchJsonCached(
  input,
  { namespace = "external", ttlSeconds = 900, timeoutMs = 10000, headers = {} } = {}
) {
  const url = new URL(input);
  const method = "GET";

  if (headers.authorization || headers.Authorization ||
      headers.cookie || headers.Cookie) {
    throw new Error("Authenticated or cookie-based API responses must not use shared caching");
  }

  // URL is included in the hashed identity, so query parameters distinguish results.
  const key = makeCacheKey(namespace, {
    method,
    url: url.toString(),
    accept: headers.accept || headers.Accept || "application/json"
  });

  const cached = await getCached(key);
  if (cached !== null) return { data: cached, cache: "HIT" };

  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`External API returned HTTP ${response.status}`);
  }

  const cacheControl = response.headers.get("cache-control") || "";
  if (/\b(no-store|private)\b/i.test(cacheControl)) {
    throw new Error("External API marked this response as private or no-store");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("External API did not return JSON");
  }

  const data = await response.json();
  if (!upstreamForbidsCaching) {
    await setCached(key, data, ttlSeconds);
  }
  return { data, cache: upstreamForbidsCaching ? "BYPASS" : "MISS" };
}
