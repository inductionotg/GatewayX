import * as users from "../services/user.service.js";
import { validateRegistration, validateCredentials } from "../validation/user.validation.js";

export async function register(req, res, next) {
  try {
    const user = await users.registerUser(validateRegistration(req.body));
    res.status(201).json({ data: user });
  } catch (error) { next(error); }
}

export async function verify(req, res, next) {
  try {
    const user = await users.verifyCredentials(validateCredentials(req.body));
    res.json({ data: user });
  } catch (error) { next(error); }
}
