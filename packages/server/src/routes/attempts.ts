import { Router } from "express";
import pool from "../db.js";

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

    await client.query("BEGIN");

    // Record the attempt
    const attemptResult = await client.query(
      `INSERT INTO attempts (user_id, word_id, app, exercise_type, mode, correct, answer_given)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [userId, wordId, app ?? "spelling", exerciseType, mode, correct, answerGiven],
    );

    // Update stats if correct
    if (correct) {
      const today = new Date().toISOString().slice(0, 10);

      // Get current stats
      const statsResult = await client.query(
        "SELECT * FROM user_stats WHERE user_id = $1 AND app = $2",
        [userId, app ?? "spelling"],
      );

      if (statsResult.rows.length > 0) {
        const stats = statsResult.rows[0];
        const lastActive = stats.last_active
          ? new Date(stats.last_active).toISOString().slice(0, 10)
          : null;

        let newStreak = stats.current_streak;

        if (lastActive === today) {
          // Already active today, streak stays
        } else if (lastActive === yesterday(today)) {
          // Consecutive day
          newStreak += 1;
        } else {
          // Streak broken or first day
          newStreak = 1;
        }

        const newLongest = Math.max(newStreak, stats.longest_streak);

        await client.query(
          `UPDATE user_stats
           SET total_points = total_points + $1,
               current_streak = $2,
               longest_streak = $3,
               last_active = $4
           WHERE user_id = $5 AND app = $6`,
          [POINTS_CORRECT, newStreak, newLongest, today, userId, app ?? "spelling"],
        );
      }
    } else {
      // Even on wrong answers, update last_active for streak tracking
      const today = new Date().toISOString().slice(0, 10);
      const statsResult = await client.query(
        "SELECT * FROM user_stats WHERE user_id = $1 AND app = $2",
        [userId, app ?? "spelling"],
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

        await client.query(
          `UPDATE user_stats
           SET current_streak = $1,
               longest_streak = $2,
               last_active = $3
           WHERE user_id = $4 AND app = $5`,
          [newStreak, newLongest, today, userId, app ?? "spelling"],
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      attemptId: attemptResult.rows[0].id,
      createdAt: attemptResult.rows[0].created_at,
      pointsAwarded: correct ? POINTS_CORRECT : 0,
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
