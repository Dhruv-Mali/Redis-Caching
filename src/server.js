import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import { connectRedis, redis } from "./config/redis.js";
import productsRouter from "./routes/products.js";
import externalCatalogRouter from "./routes/externalCatalog.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    redis: redis.isReady ? "ready" : "unavailable",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "not-connected"
  });
});

app.use("/api/products", productsRouter);
app.use("/api/external-catalog", externalCatalogRouter);

app.use((error, _req, res, _next) => {
  console.error("[api] request failed:", error);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT || 3000);

async function start() {
  // Cache is optional: start the API even if Redis is temporarily unavailable.
  try {
    await connectRedis();
  } catch (error) {
    console.warn("[startup] Redis unavailable; starting without cache:", error.message);
  }

  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000
      });
      console.log("[mongo] connected");
    } catch (error) {
      console.error("[startup] MongoDB connection failed:", error.message);
      // Keep startup behavior explicit: fail fast if a DB URI was configured.
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn("[startup] MONGODB_URI not set; database routes will fail until configured");
  }

  const server = app.listen(port, () => {
    console.log(`[api] listening on port ${port}`);
  });

  async function shutdown(signal) {
    console.log(`[api] ${signal} received; shutting down`);
    server.close(async () => {
      try {
        if (redis.isOpen) await redis.quit();
        await mongoose.disconnect();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
