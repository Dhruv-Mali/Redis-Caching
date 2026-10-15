# MERN Redis Caching Service

Shared Redis caching for public MongoDB-backed API responses and public external JSON GET APIs. Default TTL is 900 seconds (15 minutes).

## What is included

- Express middleware for cache-aside JSON GET responses.
- Redis cache keys hashed with SHA-256; query parameters are canonicalized.
- Shared Redis cache across multiple Node.js instances.
- Namespace invalidation after product mutations.
- External API helper with timeout and restrictions against caching cookie/authenticated responses.
- Cache failure is fail-open: requests continue to the source when Redis is unavailable.
- Docker Compose for a local Redis 7 instance.

## Requirements

- Node.js 20+
- Redis 7+
- MongoDB / MongoDB Atlas for the product example

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI`.
2. Start Redis:

   ```bash
   docker compose up -d redis
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Test:

   ```bash
   curl -i http://localhost:3000/health
   curl -i "http://localhost:3000/api/products?page=1&limit=20"
   curl -i "http://localhost:3000/api/products?limit=20&page=1"
   ```

The first public product request should show `X-Cache: MISS`; a repeat should show `X-Cache: HIT`. The two query parameter orders share a key.

The external API example is available at `/api/external-catalog` when `EXTERNAL_CATALOG_URL` is configured.

## Integrate with your existing app

1. Install the dependencies `redis` and `dotenv` (and use your existing `express` and `mongoose`).
2. Copy `src/config/redis.js`, `src/cache/`, and `src/services/cachedExternalApi.js` into your backend.
3. Connect Redis once during server startup using `connectRedis()`.
4. Apply `cacheResponse({ namespace: "products", ttlSeconds: 900 })` only to public GET routes that return the same data to all callers.
5. After a successful product create, update, or delete, invalidate the namespace:

   ```js
   import { invalidateCacheNamespace } from "./cache/cacheService.js";

   // Only after the database write succeeds:
   await invalidateCacheNamespace("products");
   ```

   For a critical mutation, if Redis invalidation fails, consider an outbox/retry mechanism or versioned cache namespaces so stale data cannot persist for the full TTL.

## Cache key and security rules

- The namespace is a fixed code constant; never use raw user input as a namespace.
- Query parameters are part of the key; different searches and filters won't collide.
- Cache middleware bypasses requests carrying `Authorization` or `Cookie` headers.
- Do not attach shared caching middleware to `/me`, cart, checkout, orders, account pages, admin endpoints, payment status, or other personalized/private routes.
- The external helper refuses `Authorization` and cookie headers, rejects non-2xx responses, checks JSON content type, respects `private`/`no-store`, and uses a request timeout.
- Do not expose an endpoint that fetches an arbitrary user-supplied URL. Use a trusted, configured host to avoid SSRF.
- Redis is bound to localhost in the included Compose file. Do not expose port 6379 publicly.

## Deployment

### Option A: Existing VPS

1. Install Docker Engine and the Docker Compose plugin.
2. Put this service in your backend directory and configure `.env` with a private Redis URL.
3. Run `docker compose up -d redis`.
4. Run `npm ci --omit=dev` (after committing a lockfile) and `npm start`, preferably under PM2 or your existing process manager.
5. Configure Nginx to proxy requests to the Express port and enable HTTPS.
6. Keep Redis on a private interface/network. If Redis is remote, use private networking and Redis authentication/TLS as supported by your provider.
7. Configure process monitoring and test `/health`, cache hits, invalidation, and Redis outage behavior.

### Option B: Dockerize the API

Build with `docker build -t mern-cache-api .`. The API container must share a private Docker network with Redis and use `REDIS_URL=redis://redis:6379` (service name on that network). The included Compose file intentionally only starts Redis because the existing MongoDB URI and application environment are deployment-specific.

## Production notes / known limitations

- This starter caches JSON responses after successful handlers. It is not a generic HTML or arbitrary website proxy cache.
- A cache miss can be duplicated by concurrent requests (cache stampede). For high-cost endpoints, add a distributed lock or request coalescing.
- Namespace invalidation uses Redis SCAN and is suitable for moderate cache sizes. For very large caches, use explicit tag indexes or versioned namespaces.
- Search uses an escaped regex example; for large datasets, use a MongoDB text index or dedicated search engine and appropriate indexes.
- `X-Cache` is diagnostic only; avoid exposing sensitive internal details in production if not needed.
- Set Redis memory limits appropriate to your workload. `allkeys-lru` evicts least-recently-used keys when memory is full.
- The example product model and routes are illustrative. Merge the cache utilities into your existing app rather than replacing your current authentication, payment, or business logic.
