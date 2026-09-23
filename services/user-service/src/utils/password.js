import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 64, options);
  return `scrypt$32768$8$3$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$3" ||
      !/^[0-9a-f]{32}$/.test(parts[4]) || !/^[0-9a-f]{128}$/.test(parts[5])) {
    throw new Error("Unsupported stored password hash");
  }
  const actual = await deriveKey(password, parts[4], 64, options);
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}

// Unknown email addresses still perform the expensive verification operation.
let dummyHash;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash;
}
