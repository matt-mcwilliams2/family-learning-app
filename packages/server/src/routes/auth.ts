import { Router } from "express";
import pool from "../db.js";
import {
  signToken,
  hashPassword,
  comparePassword,
  requireAuth,
  requireParent,
} from "../auth.js";

export const authRouter = Router();

// POST /api/auth/login
// Body: { email, password }
// Returns: { token, user }
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const result = await pool.query(
      `SELECT id, family_id, display_name, role, password_hash
       FROM users
       WHERE email = $1 AND role = 'parent'`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken({
      userId: user.id,
      familyId: user.family_id,
      role: "parent",
    });

    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        role: "parent",
        familyId: user.family_id,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/child-login
// Body: { username, password }
// Returns: { token, user }
authRouter.post("/child-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    const result = await pool.query(
      `SELECT id, family_id, display_name, role, password_hash, current_level, active
       FROM users
       WHERE lower(username) = lower($1) AND role = 'child'`,
      [username.trim()],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const user = result.rows[0];

    if (user.active === false) {
      res.status(401).json({ error: "This account has been deactivated" });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = signToken({
      userId: user.id,
      familyId: user.family_id,
      role: "child",
    });

    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        role: "child",
        familyId: user.family_id,
        currentLevel: parseFloat(user.current_level),
      },
    });
  } catch (err) {
    console.error("POST /api/auth/child-login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/profiles
// Returns child profiles for the family (no auth needed — this is the profile picker)
// Query: familyId (optional, defaults to first family)
authRouter.get("/profiles", async (_req, res) => {
  try {
    // For a single-family setup, return all active children
    const result = await pool.query(
      `SELECT u.id, u.display_name, u.current_level
       FROM users u
       WHERE u.role = 'child' AND u.active = true
       ORDER BY u.display_name`,
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        displayName: r.display_name,
        currentLevel: parseFloat(r.current_level),
      })),
    );
  } catch (err) {
    console.error("GET /api/auth/profiles error:", err);
    res.status(500).json({ error: "Failed to load profiles" });
  }
});

// GET /api/auth/me
// Returns current user info from token
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, family_id, display_name, role, current_level, email
       FROM users WHERE id = $1`,
      [req.auth!.userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      displayName: user.display_name,
      role: user.role,
      familyId: user.family_id,
      currentLevel: parseFloat(user.current_level),
      email: user.email,
    });
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// POST /api/auth/children
// Create a new child profile. Parent only.
// Body: { displayName, pin }
authRouter.post("/children", requireAuth, requireParent, async (req, res) => {
  try {
    const { displayName, pin } = req.body;
    if (!displayName || !pin) {
      res.status(400).json({ error: "Display name and PIN required" });
      return;
    }
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      res.status(400).json({ error: "PIN must be 4-6 digits" });
      return;
    }

    const hashedPin = await hashPassword(pin);
    const familyId = req.auth!.familyId;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, pin, current_level)
         VALUES ($1, $2, 'child', $3, 6.0)
         RETURNING id, current_level`,
        [familyId, displayName, hashedPin],
      );

      const childId = userResult.rows[0].id;

      // Create user_stats row
      await client.query(
        `INSERT INTO user_stats (user_id, app, total_points, current_streak, longest_streak)
         VALUES ($1, 'spelling', 0, 0, 0)`,
        [childId],
      );

      await client.query("COMMIT");

      res.json({
        id: childId,
        displayName,
        currentLevel: 6.0,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/auth/children error:", err);
    res.status(500).json({ error: "Failed to create child profile" });
  }
});
