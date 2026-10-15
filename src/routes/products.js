import { Router } from "express";
import { Product } from "../models/Product.js";
import { cacheResponse } from "../cache/cacheMiddleware.js";
import { invalidateCacheNamespace } from "../cache/cacheService.js";

const router = Router();

// Public read route. Keep auth/admin/private routes out of this middleware.
router.get("/", cacheResponse({ namespace: "products", ttlSeconds: 900 }), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "20", 10) || 20));
    const search = String(req.query.search || "").trim().slice(0, 100);

    // In production, prefer a properly escaped search strategy or MongoDB text index.
    const filter = { active: true };
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select("name description price")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter)
    ]);

    res.json({ items, page, limit, total });
  } catch (error) {
    next(error);
  }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * After a successful product create/update/delete in your existing admin
 * controller, call:
 *
 *   await invalidateCacheNamespace("products");
 *
 * Keep your existing authentication/authorization middleware on admin routes.
 */
export default router;
