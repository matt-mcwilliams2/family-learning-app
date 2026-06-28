import { Router } from "express";
import pool from "../db.js";
import {
  computeLevelAdjustment,
  combinedAccuracy,
  LEVELING_CONFIG,
} from "@family-learning/shared";

export const sessionsRouter = Router();

// POST /api/sessions
// Body: { userId, app, mode, totalWords, correctCount }
// Records the session, computes accuracy, and runs adaptive leveling.
sessionsRouter.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, app, mode, totalWords, correctCount } = req.body;
    const appName = app ?? "spelling";

    if (totalWords <= 0) {
      res.status(400).json({ error: "totalWords must be greater than 0" });
      return;
    }

    const accuracy = correctCount / totalWords;

    await client.query("BEGIN");

    // Get the student's current level
    const userResult = await client.query(
      "SELECT current_level FROM users WHERE id = $1",
      [userId],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentLevel = parseFloat(userResult.rows[0].current_level);

    // Decide whether to adjust the level.
    // A test session triggers leveling on its own.
    // Practice/learn sessions use a window of the last N sessions.
    let adjustment;

    if (mode === "test") {
      // A weekly test drives leveling by itself
      adjustment = computeLevelAdjustment(currentLevel, accuracy);
    } else {
      // For practice/learn, look at the window of recent sessions
      const recentResult = await client.query(
        `SELECT correct_count, total_words FROM sessions
         WHERE user_id = $1 AND app = $2 AND mode IN ('practice', 'learn')
         ORDER BY created_at DESC
         LIMIT $3`,
        [userId, appName, LEVELING_CONFIG.windowSize - 1],
      );

      // Combine the current session with recent ones
      const window = [
        { correctCount, totalWords },
        ...recentResult.rows.map((r: any) => ({
          correctCount: r.correct_count as number,
          totalWords: r.total_words as number,
        })),
      ];

      // Only adjust if we have enough sessions in the window
      if (window.length >= LEVELING_CONFIG.windowSize) {
        const combined = combinedAccuracy(window);
        adjustment = computeLevelAdjustment(currentLevel, combined);
      } else {
        adjustment = { newLevel: currentLevel, direction: "hold" as const, accuracy };
      }
    }

    // Update the user's level if it changed
    if (adjustment.newLevel !== currentLevel) {
      await client.query(
        "UPDATE users SET current_level = $1 WHERE id = $2",
        [adjustment.newLevel, userId],
      );
    }

    // Record the session
    const sessionResult = await client.query(
      `INSERT INTO sessions (user_id, app, mode, total_words, correct_count,
                              accuracy, level_at_start, level_at_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        userId,
        appName,
        mode,
        totalWords,
        correctCount,
        accuracy,
        currentLevel,
        adjustment.newLevel,
      ],
    );

    await client.query("COMMIT");

    res.json({
      sessionId: sessionResult.rows[0].id,
      createdAt: sessionResult.rows[0].created_at,
      accuracy: Math.round(accuracy * 10000) / 10000,
      levelBefore: currentLevel,
      levelAfter: adjustment.newLevel,
      levelDirection: adjustment.direction,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/sessions error:", err);
    res.status(500).json({ error: "Failed to record session" });
  } finally {
    client.release();
  }
});

// GET /api/sessions/:userId
// Returns recent sessions for a user.
// Query params: app (default "spelling"), limit (default 10)
sessionsRouter.get("/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";
    const limit = Math.min(parseInt((req.query.limit as string) ?? "10", 10), 50);

    const result = await pool.query(
      `SELECT id, mode, total_words, correct_count, accuracy,
              level_at_start, level_at_end, created_at
       FROM sessions
       WHERE user_id = $1 AND app = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, app, limit],
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        mode: r.mode,
        totalWords: r.total_words,
        correctCount: r.correct_count,
        accuracy: parseFloat(r.accuracy),
        levelAtStart: parseFloat(r.level_at_start),
        levelAtEnd: parseFloat(r.level_at_end),
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    console.error("GET /api/sessions error:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});
