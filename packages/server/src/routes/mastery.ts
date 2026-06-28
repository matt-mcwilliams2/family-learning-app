import { Router } from "express";
import pool from "../db.js";

export const masteryRouter = Router();

// GET /api/mastery/:userId
// Returns all mastery records for a user, optionally filtered by app.
// Query params: app (default "spelling")
masteryRouter.get("/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";

    const result = await pool.query(
      `SELECT wm.word_id, wm.mastery_score, wm.has_ever_missed,
              wm.attempt_count, wm.next_review_at, wm.last_attempted_at,
              w.word, w.grade, w.definition
       FROM word_mastery wm
       JOIN words w ON w.id = wm.word_id
       WHERE wm.user_id = $1 AND wm.app = $2
       ORDER BY wm.mastery_score ASC`,
      [userId, app],
    );

    res.json(
      result.rows.map((r: any) => ({
        wordId: r.word_id,
        word: r.word,
        grade: parseFloat(r.grade),
        definition: r.definition,
        masteryScore: parseFloat(r.mastery_score),
        hasEverMissed: r.has_ever_missed,
        attemptCount: r.attempt_count,
        nextReviewAt: r.next_review_at,
        lastAttemptedAt: r.last_attempted_at,
      })),
    );
  } catch (err) {
    console.error("GET /api/mastery error:", err);
    res.status(500).json({ error: "Failed to fetch mastery data" });
  }
});
