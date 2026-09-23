import express from "express";
import productRoutes from "./routes/product.routes.js";
import {
  notFoundHandler,
  errorHandler,
} from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "product-service",
  });
});

app.use("/products", productRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;