import express from "express";
import userRoutes from "./routes/user.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.get("/health", (req, res) => res.json({ status: "ok", service: "user-service" }));
app.use(userRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
export default app;
