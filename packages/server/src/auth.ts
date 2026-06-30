import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "spelling-app-dev-secret-change-me";
const TOKEN_EXPIRY = "30d";

export interface AuthPayload {
  userId: number;
  familyId: number | null;
  role: "parent" | "child" | "admin";
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

// ── Token helpers ──────────────────────────────────────────────

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

// ── Password / PIN hashing ─────────────────────────────────────

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Middleware ──────────────────────────────────────────────────

/** Require a valid JWT. Rejects with 401 if missing/invalid. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.auth = payload;
  next();
}

/** Require the logged-in user to be a parent. Must come after requireAuth. */
export function requireParent(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "parent") {
    res.status(403).json({ error: "Parent account required" });
    return;
  }
  next();
}

/** Require the logged-in user to be an admin. Must come after requireAuth. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin account required" });
    return;
  }
  next();
}
