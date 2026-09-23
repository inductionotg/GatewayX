import * as productService from "../services/product.service.js";

export async function listProducts(req, res, next) {
  try {
    const products = await productService.getProducts();

    res.status(200).json({
      data: products,
    });
  } catch (error) {
    next(error);
  }
}
export async function getProduct(req, res, next) {
  try {
    const { id } = req.params;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
      return res.status(400).json({
        error: {
          code: "INVALID_PRODUCT_ID",
          message: "Product ID must be a valid UUID",
        },
      });
    }

    const product = await productService.getProductById(id);

    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        },
      });
    }

    return res.status(200).json({
      data: product,
    });
  } catch (error) {
    next(error);
  }
}