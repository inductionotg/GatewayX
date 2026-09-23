import { getProductById } from "./product.service.js";
import { getReviewsByProductId } from "./review.service.js";

export async function getProductOverview(id) {
  const [productResult, reviews] = await Promise.all([
    getProductById(id).catch((error) => {
      console.error("Product lookup failed:", error);
      return null;
    }),

    getReviewsByProductId(id).catch((error) => {
      console.error("Review lookup failed:", error);
      return null;
    }),
  ]);

  return { productResult, reviews };
}