import prisma from "../config/db.js";

export async function getProducts() {
  return prisma.product.findMany({
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: 50,
  });
}
export async function getProductById(id) {
  return prisma.product.findUnique({
    where: { id },
  });
}