import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireAdmin, hashPassword } from "../auth.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// GET /api/admin/teachers
// List all teacher (parent) accounts.
adminRouter.get("/teachers", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE role = 'parent'
       ORDER BY last_name, first_name`,
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
      })),
    );
  } catch (err) {
    console.error("GET /api/admin/teachers error:", err);
    res.status(500).json({ error: "Failed to load teachers" });
  }
});

// POST /api/admin/teachers
// Create a new teacher with their own family.
// Body: { email, password, firstName, lastName }
adminRouter.post("/teachers", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: "Email, password, first name, and last name are required" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check email uniqueness
      const existing = await client.query(
        "SELECT id FROM users WHERE email = $1",
        [email.toLowerCase().trim()],
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: "A user with that email already exists" });
        await client.query("ROLLBACK");
        return;
      }

      // Create a family for this teacher
      const familyResult = await client.query(
        "INSERT INTO families (name) VALUES ($1) RETURNING id",
        [`${firstName.trim()} ${lastName.trim()} Family`],
      );
      const familyId = familyResult.rows[0].id;

      // Hash password and create the teacher
      const passwordHash = await hashPassword(password);
      const userResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, email, password_hash,
                            first_name, last_name, current_level)
         VALUES ($1, $2, 'parent', $3, $4, $5, $6, 6.0)
         RETURNING id`,
        [
          familyId,
          `${firstName.trim()} ${lastName.trim()}`,
          email.toLowerCase().trim(),
          passwordHash,
          firstName.trim(),
          lastName.trim(),
        ],
      );

      await client.query("COMMIT");

      res.json({
        id: userResult.rows[0].id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        familyId,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/admin/teachers error:", err);
    res.status(500).json({ error: "Failed to create teacher" });
  }
});

// PUT /api/admin/teachers/:id/reset-password
// Body: { password }
adminRouter.put("/teachers/:id/reset-password", async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    // Verify the target is a teacher
    const existing = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'parent'",
      [teacherId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Teacher not found" });
      return;
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, teacherId],
    );

    res.json({ id: teacherId, reset: true });
  } catch (err) {
    console.error("PUT /api/admin/teachers/:id/reset-password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});
