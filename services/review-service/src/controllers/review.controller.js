import * as reviewService from "../services/review.service.js";

export async function listReviews(req, res, next) {
  try {
    const { productId } = req.query;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof productId !== "string" ||
      !uuidPattern.test(productId)
    ) {
      return res.status(400).json({
        error: {
          code: "INVALID_PRODUCT_ID",
          message: "Provide a valid productId query parameter",
        },
      });
    }

    const reviews = await reviewService.getReviewsByProductId(
      productId
    );

    return res.status(200).json({
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
}