import { registerUser } from "../services/user.service.js";

export async function register(req, res, next) {
  try {
    const result = await registerUser(req.body);
    res.set("Cache-Control", "no-store");
    res.status(result.status).json(result.data);
  } catch (error) { next(error); }
}
