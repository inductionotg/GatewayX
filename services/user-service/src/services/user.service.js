import prisma from "../config/db.js";
import { hashPassword, verifyPassword, getDummyHash } from "../utils/password.js";
import { HttpError } from "../utils/http-error.js";

const safeFields = { id: true, name: true, email: true, createdAt: true };

export async function registerUser({ name, email, password }) {
  const passwordHash = await hashPassword(password);
  try {
    return await prisma.user.create({
      data: { name, email, passwordHash },
      select: safeFields,
    });
  } catch (error) {
    // The database constraint also protects against concurrent registrations.
    if (error.code === "P2002") {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists");
    }
    throw error;
  }
}

export async function verifyCredentials({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const matches = await verifyPassword(password, user?.passwordHash ?? await getDummyHash());
  if (!user || !matches) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}
