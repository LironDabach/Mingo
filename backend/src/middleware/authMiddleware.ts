import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// extends the Request interface to include user property
export type AuthRequest = Request & { user?: { _id: string } };

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({
        message: "Unauthorized: missing or invalid Authorization header",
      });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: missing token" });
  }
  const secret = process.env.JWT_SECRET || "default_secret";
  try {
    const decoded = jwt.verify(token, secret) as { _id: string };
    req.user = { _id: decoded._id };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: "Unauthorized: invalid or expired token" });
  }
};
