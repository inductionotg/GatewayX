import express from "express";
import reviewRoutes from "./routes/review.routes.js";
import {
  notFoundHandler,
  errorHandler,
} from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "review-service",
  });
});

app.use("/reviews", reviewRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;