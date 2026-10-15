import { makeCacheKey, getCached, setCached } from "./cacheService.js";

const defaultTtl = Number(process.env.CACHE_TTL_SECONDS || 900);

function canonicalUrl(req) {
  // Sort query pairs so ?a=1&b=2 and ?b=2&a=1 use the same cache identity.
  const url = new URL(req.originalUrl, "http://cache.local");
  const pairs = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
    ak.localeCompare(bk) || av.localeCompare(bv)
  );
  const query = new URLSearchParams();
  for (const [key, value] of pairs) query.append(key, value);
  return `${req.baseUrl}${url.pathname}${query.size ? `?${query.toString()}` : ""}`;
}

export function cacheResponse({ namespace, ttlSeconds = defaultTtl } = {}) {
  if (!namespace) throw new Error("cacheResponse requires a fixed namespace");

  return async function redisCacheMiddleware(req, res, next) {
    if (req.method !== "GET") return next();

    // Never share data across sessions. Apply this middleware only to public routes.
    if (req.headers.authorization || req.headers.cookie) {
      res.set("X-Cache", "BYPASS");
      return next();
    }

    const identity = {
      method: req.method,
      url: canonicalUrl(req),
      accept: req.get("accept") || "application/json"
    };
    const key = makeCacheKey(namespace, identity);

    const cached = await getCached(key);
    if (cached !== null) {
      res.set("X-Cache", "HIT");
      res.set("X-Cache-TTL", String(ttlSeconds));
      return res.status(cached.status || 200).json(cached.body);
    }

    res.set("X-Cache", "MISS");
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      const status = res.statusCode;
      const contentType = res.get("Content-Type") || "application/json";

      // Only cache successful JSON responses. Never cache errors.
      if (status >= 200 && status < 300 &&
          contentType.toLowerCase().includes("application/json")) {
        void setCached(key, { status, body }, ttlSeconds);
      }

      return originalJson(body);
    };

    return next();
  };
}
