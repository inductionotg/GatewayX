import { getProductOverview } from "../services/product-overview.service.js";

export async function showProductOverview(req, res, next) {
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

    const { productResult, reviews } =
      await getProductOverview(id);

    if (productResult?.status === 404) {
      return res.status(404).json(productResult.data);
    }

    const product = productResult?.data?.data;

    if (
      productResult?.status !== 200 ||
      !product ||
      product.id !== id.toLowerCase()
    ) {
      return res.status(503).json({
        error: {
          code: "PRODUCT_SERVICE_UNAVAILABLE",
          message: "Product details are temporarily unavailable",
        },
      });
    }

    return res.status(200).json({
      data: {
        product,
        reviews,
      },
      warnings:
        reviews === null
          ? [
              {
                code: "REVIEWS_UNAVAILABLE",
                message: "Reviews are temporarily unavailable",
              },
            ]
          : [],
    });
  } catch (error) {
    next(error);
  }
}