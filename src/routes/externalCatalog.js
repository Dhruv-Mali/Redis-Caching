import { Router } from "express";
import { fetchJsonCached } from "../services/cachedExternalApi.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const endpoint = process.env.EXTERNAL_CATALOG_URL;
    if (!endpoint) {
      return res.status(503).json({
        error: "EXTERNAL_CATALOG_URL is not configured"
      });
    }

    // In production, configure a trusted fixed host. Do not accept arbitrary
    // user-provided URLs here; that can create an SSRF vulnerability.
    const result = await fetchJsonCached(endpoint, {
      namespace: "external-catalog",
      ttlSeconds: 900
    });

    res.set("X-External-Cache", result.cache);
    res.json(result.data);
  } catch (error) {
    next(error);
  }
});

export default router;
