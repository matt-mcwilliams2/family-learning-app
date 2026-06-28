import { Router } from "express";
import pool from "../db.js";
import { getReviewPriority } from "@family-learning/shared";

export const schedulerRouter = Router();

// GET /api/scheduler/:userId/due
// Returns words due for review, ordered by priority (highest first).
// Query params: app (default "spelling"), limit (default 20)
schedulerRouter.get("/:userId/due", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 100);
    const now = new Date();

    // Fetch words that are due for review (next_review_at <= now)
    const result = await pool.query(
      `SELECT wm.word_id, wm.mastery_score, wm.has_ever_missed,
              wm.attempt_count, wm.next_review_at, wm.last_attempted_at,
              w.word, w.grade, w.definition, w.example, w.syllables,
              w.pronunciation_override
       FROM word_mastery wm
       JOIN words w ON w.id = wm.word_id
       WHERE wm.user_id = $1 AND wm.app = $2 AND wm.next_review_at <= $3
       ORDER BY wm.next_review_at ASC`,
      [userId, app, now],
    );

    // Compute priority and sort by it
    const words = result.rows
      .map((r: any) => {
        const mastery = parseFloat(r.mastery_score);
        const hasEverMissed = r.has_ever_missed;
        const nextReviewAt = new Date(r.next_review_at);
        const priority = getReviewPriority(mastery, hasEverMissed, nextReviewAt, now);

        return {
          wordId: r.word_id,
          word: r.word,
          grade: parseFloat(r.grade),
          definition: r.definition,
          example: r.example,
          syllables: r.syllables,
          pronunciationOverride: r.pronunciation_override,
          masteryScore: mastery,
          hasEverMissed,
          attemptCount: r.attempt_count,
          nextReviewAt: r.next_review_at,
          lastAttemptedAt: r.last_attempted_at,
          priority,
        };
      })
      .sort((a: any, b: any) => b.priority - a.priority)
      .slice(0, limit);

    res.json(words);
  } catch (err) {
    console.error("GET /api/scheduler/:userId/due error:", err);
    res.status(500).json({ error: "Failed to fetch due words" });
  }
});
