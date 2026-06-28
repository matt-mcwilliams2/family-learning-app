import { Router } from "express";
import pool from "../db.js";
import { computeMastery, getNextReviewDate } from "@family-learning/shared";
import type { Attempt } from "@family-learning/shared";
import { checkAndAwardBadges } from "./badges.js";

export const attemptsRouter = Router();

// Points awarded per correct answer
const POINTS_CORRECT = 10;

// POST /api/attempts
// Body: { userId, wordId, app, exerciseType, mode, correct, answerGiven }
attemptsRouter.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, wordId, app, exerciseType, mode, correct, answerGiven } =
      req.body;

    const appName = app ?? "spelling";

    await client.query("BEGIN");

    // Record the attempt
    const attemptResult = await client.query(
      `INSERT INTO attempts (user_id, word_id, app, exercise_type, mode, correct, answer_given)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [userId, wordId, appName, exerciseType, mode, correct, answerGiven],
    );

    // Update streaks and points
    const today = new Date().toISOString().slice(0, 10);
    const statsResult = await client.query(
      "SELECT * FROM user_stats WHERE user_id = $1 AND app = $2",
      [userId, appName],
    );

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      const lastActive = stats.last_active
        ? new Date(stats.last_active).toISOString().slice(0, 10)
        : null;

      let newStreak = stats.current_streak;
      if (lastActive === today) {
        // Already active today
      } else if (lastActive === yesterday(today)) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
      const newLongest = Math.max(newStreak, stats.longest_streak);
      const pointsToAdd = correct ? POINTS_CORRECT : 0;

      await client.query(
        `UPDATE user_stats
         SET total_points = total_points + $1,
             current_streak = $2,
             longest_streak = $3,
             last_active = $4
         WHERE user_id = $5 AND app = $6`,
        [pointsToAdd, newStreak, newLongest, today, userId, appName],
      );
    }

    // --- Recompute mastery for this word ---
    const attemptsRows = await client.query(
      `SELECT id, user_id, word_id, app, exercise_type, mode, correct,
              answer_given, created_at
       FROM attempts
       WHERE user_id = $1 AND word_id = $2 AND app = $3
       ORDER BY created_at DESC`,
      [userId, wordId, appName],
    );

    const attempts: Attempt[] = attemptsRows.rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      wordId: r.word_id,
      app: r.app,
      exerciseType: r.exercise_type,
      mode: r.mode,
      correct: r.correct,
      answerGiven: r.answer_given,
      createdAt: new Date(r.created_at),
    }));

    const { score, hasEverMissed } = computeMastery(attempts);
    const lastAttemptDate = new Date(attemptResult.rows[0].created_at);
    const nextReview = getNextReviewDate(score, hasEverMissed, lastAttemptDate);

    await client.query(
      `INSERT INTO word_mastery (user_id, word_id, app, mastery_score, has_ever_missed,
                                  attempt_count, next_review_at, last_attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, word_id, app)
       DO UPDATE SET mastery_score = $4,
                     has_ever_missed = $5,
                     attempt_count = $6,
                     next_review_at = $7,
                     last_attempted_at = $8`,
      [
        userId,
        wordId,
        appName,
        score,
        hasEverMissed,
        attempts.length,
        nextReview,
        lastAttemptDate,
      ],
    );

    // --- Track word introduction (seen in 2+ exercise types) ---
    await client.query(
      `INSERT INTO word_introductions (user_id, word_id, app, exercise_types, introduced)
       VALUES ($1, $2, $3, ARRAY[$4::text], false)
       ON CONFLICT (user_id, word_id, app)
       DO UPDATE SET
         exercise_types = CASE
           WHEN $4 = ANY(word_introductions.exercise_types)
           THEN word_introductions.exercise_types
           ELSE array_append(word_introductions.exercise_types, $4::text)
         END,
         introduced = CASE
           WHEN $4 = ANY(word_introductions.exercise_types)
           THEN array_length(word_introductions.exercise_types, 1) >= 2
           ELSE array_length(word_introductions.exercise_types, 1) + 1 >= 2
         END`,
      [userId, wordId, appName, exerciseType],
    );

    // Check for newly earned badges
    const newBadges = await checkAndAwardBadges(client, userId, appName, {
      type: "attempt",
    });

    await client.query("COMMIT");

    res.json({
      attemptId: attemptResult.rows[0].id,
      createdAt: attemptResult.rows[0].created_at,
      pointsAwarded: correct ? POINTS_CORRECT : 0,
      masteryScore: score,
      hasEverMissed,
      nextReviewAt: nextReview.toISOString(),
      newBadges,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/attempts error:", err);
    res.status(500).json({ error: "Failed to record attempt" });
  } finally {
    client.release();
  }
});

function yesterday(todayStr: string): string {
  const d = new Date(todayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
