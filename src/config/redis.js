import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redis = createClient({
  url: redisUrl,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy(retries) {
      // Exponential backoff, capped at 3 seconds.
      return Math.min(retries * 200, 3000);
    }
  }
});

redis.on("error", (error) => {
  console.error("[redis] client error:", error.message);
});

redis.on("ready", () => console.log("[redis] ready"));
redis.on("reconnecting", () => console.warn("[redis] reconnecting"));

export async function connectRedis() {
  if (redis.isOpen) return;
  await redis.connect();
}
