import { Router } from "express";
import pool from "../db.js";

export const assignedTestsRouter = Router();

// GET /api/assigned-tests/pending
// Check if the current child has a pending assigned test.
assignedTestsRouter.get("/pending", async (req, res) => {
  try {
    const userId = req.auth!.userId;

    const result = await pool.query(
      `SELECT id, word_count, assigned_at
       FROM assigned_tests
       WHERE child_id = $1 AND status = 'pending'
       ORDER BY assigned_at DESC
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.json(null);
      return;
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      wordCount: row.word_count,
      assignedAt: row.assigned_at,
    });
  } catch (err) {
    console.error("GET /api/assigned-tests/pending error:", err);
    res.status(500).json({ error: "Failed to check for assigned tests" });
  }
});

// POST /api/assigned-tests/:testId/complete
// Mark an assigned test as completed and link to the session.
// Body: { sessionId }
assignedTestsRouter.post("/:testId/complete", async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const testId = parseInt(req.params.testId, 10);
    const { sessionId } = req.body;

    if (typeof sessionId !== "number") {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    // Verify the test belongs to this child and is pending
    const testCheck = await pool.query(
      "SELECT id FROM assigned_tests WHERE id = $1 AND child_id = $2 AND status = 'pending'",
      [testId, userId],
    );
    if (testCheck.rows.length === 0) {
      res.status(404).json({ error: "Pending test not found" });
      return;
    }

    await pool.query(
      "UPDATE assigned_tests SET status = 'completed', session_id = $1, completed_at = NOW() WHERE id = $2",
      [sessionId, testId],
    );

    res.json({ completed: true });
  } catch (err) {
    console.error("POST /api/assigned-tests/:testId/complete error:", err);
    res.status(500).json({ error: "Failed to complete assigned test" });
  }
});
