import { Router } from "express";
import { register, verify } from "../controllers/user.controller.js";

const router = Router();
router.post("/users", register);
// Internal service operation; not exposed as a public gateway route.
router.post("/auth/verify", verify);
export default router;
