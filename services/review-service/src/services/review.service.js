import prisma from "../config/db.js";

export async function getReviewsByProductId(productId) {
  return prisma.review.findMany({
    where: { productId },
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: 50,
  });
}