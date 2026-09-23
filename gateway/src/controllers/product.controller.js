import * as productService from "../services/product.service.js";

export async function listProducts(req, res, next) {
  try {
    const result = await productService.getProducts();

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req, res, next) {
  try {
    const result = await productService.getProductById(
      req.params.id
    );

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}