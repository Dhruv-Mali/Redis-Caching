import { createHash } from "node:crypto";
import { redis } from "../config/redis.js";

const prefix = (process.env.CACHE_KEY_PREFIX || "myapp")
  .replace(/[^a-zA-Z0-9:_-]/g, "")
  .slice(0, 50) || "myapp";
const version = "v1";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function makeCacheKey(namespace, identity) {
  // namespace must be a developer-controlled constant, never raw user input.
  const safeNamespace = String(namespace).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!safeNamespace) throw new Error("A valid cache namespace is required");
  const serialized = typeof identity === "string" ? identity : JSON.stringify(identity);
  return `${prefix}:${version}:${safeNamespace}:${hash(serialized)}`;
}

export async function getCached(key) {
  try {
    if (!redis.isReady) return null;
    const value = await redis.get(key);
    if (value === null) return null;
    return JSON.parse(value);
  } catch (error) {
    console.warn("[cache] read skipped:", error.message);
    return null; // Cache is an optimization; the application should still work.
  }
}

export async function setCached(key, value, ttlSeconds = 900) {
  try {
    if (!redis.isReady) return false;
    const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 900));
    await redis.set(key, JSON.stringify(value), { EX: ttl });
    return true;
  } catch (error) {
    console.warn("[cache] write skipped:", error.message);
    return false;
  }
}

export async function deleteCacheKey(key) {
  try {
    if (redis.isReady) await redis.del(key);
  } catch (error) {
    console.warn("[cache] delete skipped:", error.message);
  }
}

export async function invalidateCacheNamespace(namespace) {
  // Use only a fixed, developer-controlled namespace here.
  const safeNamespace = String(namespace).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!safeNamespace || !redis.isReady) return 0;

  const pattern = `${prefix}:${version}:${safeNamespace}:*`;
  let deleted = 0;
  let batch = [];

  try {
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 200 })) {
      batch.push(key);
      if (batch.length >= 200) {
        deleted += await redis.del(batch);
        batch = [];
      }
    }
    if (batch.length) deleted += await redis.del(batch);
  } catch (error) {
    console.warn("[cache] namespace invalidation failed:", error.message);
  }
  return deleted;
}
