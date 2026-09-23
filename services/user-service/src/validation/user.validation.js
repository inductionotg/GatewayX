import { HttpError } from "../utils/http-error.js";

function invalid(message) {
  throw new HttpError(400, "VALIDATION_ERROR", message);
}

export function validateCredentials(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("A JSON object is required");
  }
  if (typeof body.email !== "string") invalid("A valid email is required");
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("A valid email is required");
  }
  if (typeof body.password !== "string" || body.password.length < 8 ||
      Buffer.byteLength(body.password, "utf8") > 128) {
    invalid("Password must contain at least 8 characters and at most 128 UTF-8 bytes");
  }
  return { email, password: body.password };
}

export function validateRegistration(body) {
  const credentials = validateCredentials(body);
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
    invalid("Name must contain between 1 and 100 characters");
  }
  return { ...credentials, name: body.name.trim() };
}
