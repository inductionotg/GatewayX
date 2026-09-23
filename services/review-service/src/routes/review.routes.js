import { Router } from "express";
import { listReviews } from "../controllers/review.controller.js";

const router = Router();

router.get("/", listReviews);

export default router;