import { Router } from "express";
import {
  listProducts,
  getProduct,
} from "../controllers/product.controller.js";
import {
  showProductOverview,
} from "../controllers/product-overview.controller.js";

const router = Router();

router.get("/", listProducts);
router.get("/:id/overview", showProductOverview);
router.get("/:id", getProduct);

export default router;