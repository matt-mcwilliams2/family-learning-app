import { Router } from "express";
import pool from "../db.js";

export const mathRouter = Router();

function yesterday(todayStr: string): string {
  const d = new Date(todayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// POST /api/math/sessions
// Records a completed math session, updates stats/streak, checks records.
mathRouter.post("/sessions", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.auth!.userId;
    const { operation, durationSecs, totalProblems, correctCount, allCorrect, elapsedSecs } =
      req.body;

    if (!operation || !durationSecs || totalProblems == null || correctCount == null) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    await client.query("BEGIN");

    // Record the session
    const sessionResult = await client.query(
      `INSERT INTO math_sessions (user_id, operation, duration_secs, total_problems,
                                   correct_count, all_correct, elapsed_secs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, operation, durationSecs, totalProblems, correctCount, allCorrect || false, elapsedSecs || null],
    );
    const sessionId = sessionResult.rows[0].id;

    // Update user_stats for app='math' (upsert)
    const today = new Date().toISOString().slice(0, 10);
    const pointsToAdd = correctCount; // 1 point per correct answer

    const statsResult = await client.query(
      "SELECT * FROM user_stats WHERE user_id = $1 AND app = 'math'",
      [userId],
    );

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      const lastActive = stats.last_active
        ? new Date(stats.last_active).toISOString().slice(0, 10)
        : null;

      let newStreak = stats.current_streak;
      if (lastActive === today) {
        // Already active today
      } else if (lastActive && lastActive === yesterday(today)) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
      const newLongest = Math.max(newStreak, stats.longest_streak);

      await client.query(
        `UPDATE user_stats
         SET total_points = total_points + $1,
             current_streak = $2,
             longest_streak = $3,
             last_active = $4
         WHERE user_id = $5 AND app = 'math'`,
        [pointsToAdd, newStreak, newLongest, today, userId],
      );
    } else {
      await client.query(
        `INSERT INTO user_stats (user_id, app, total_points, current_streak, longest_streak, last_active)
         VALUES ($1, 'math', $2, 1, 1, $3)`,
        [userId, pointsToAdd, today],
      );
    }

    // Check/update personal record
    let newRecord = false;
    let bestTime: number | null = null;

    if (allCorrect && elapsedSecs) {
      const recordResult = await client.query(
        "SELECT best_time_secs FROM math_records WHERE user_id = $1 AND operation = $2",
        [userId, operation],
      );

      if (recordResult.rows.length === 0) {
        // First record
        await client.query(
          `INSERT INTO math_records (user_id, operation, best_time_secs, achieved_at)
           VALUES ($1, $2, $3, NOW())`,
          [userId, operation, elapsedSecs],
        );
        newRecord = true;
        bestTime = elapsedSecs;
      } else if (elapsedSecs < recordResult.rows[0].best_time_secs) {
        // New record
        await client.query(
          `UPDATE math_records SET best_time_secs = $1, achieved_at = NOW()
           WHERE user_id = $2 AND operation = $3`,
          [elapsedSecs, userId, operation],
        );
        newRecord = true;
        bestTime = elapsedSecs;
      } else {
        bestTime = recordResult.rows[0].best_time_secs;
      }
    }

    await client.query("COMMIT");

    res.json({
      sessionId,
      pointsAwarded: pointsToAdd,
      newRecord,
      bestTime,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/math/sessions error:", err);
    res.status(500).json({ error: "Failed to record math session" });
  } finally {
    client.release();
  }
});

// GET /api/math/records/:userId
// Returns personal records for all operations.
mathRouter.get("/records/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const result = await pool.query(
      "SELECT operation, best_time_secs, achieved_at FROM math_records WHERE user_id = $1",
      [userId],
    );

    const records: Record<string, { bestTimeSecs: number; achievedAt: string } | null> = {
      addition: null,
      subtraction: null,
      multiplication: null,
      division: null,
    };

    for (const row of result.rows) {
      records[row.operation] = {
        bestTimeSecs: row.best_time_secs,
        achievedAt: row.achieved_at,
      };
    }

    res.json(records);
  } catch (err) {
    console.error("GET /api/math/records error:", err);
    res.status(500).json({ error: "Failed to load records" });
  }
});

// GET /api/math/stats/:userId
// Returns math stats (points, streak) and personal records.
mathRouter.get("/stats/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    const statsResult = await pool.query(
      "SELECT total_points, current_streak, longest_streak, last_active FROM user_stats WHERE user_id = $1 AND app = 'math'",
      [userId],
    );

    const stats = statsResult.rows.length > 0
      ? {
          totalPoints: statsResult.rows[0].total_points,
          currentStreak: statsResult.rows[0].current_streak,
          longestStreak: statsResult.rows[0].longest_streak,
          lastActive: statsResult.rows[0].last_active,
        }
      : { totalPoints: 0, currentStreak: 0, longestStreak: 0, lastActive: null };

    const recordsResult = await pool.query(
      "SELECT operation, best_time_secs, achieved_at FROM math_records WHERE user_id = $1",
      [userId],
    );

    const records: Record<string, { bestTimeSecs: number; achievedAt: string } | null> = {
      addition: null,
      subtraction: null,
      multiplication: null,
      division: null,
    };

    for (const row of recordsResult.rows) {
      records[row.operation] = {
        bestTimeSecs: row.best_time_secs,
        achievedAt: row.achieved_at,
      };
    }

    res.json({ ...stats, records });
  } catch (err) {
    console.error("GET /api/math/stats error:", err);
    res.status(500).json({ error: "Failed to load math stats" });
  }
});

// GET /api/math/sessions/:userId
// Returns recent math sessions for a user.
mathRouter.get("/sessions/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 50);

    const result = await pool.query(
      `SELECT id, operation, duration_secs, total_problems, correct_count,
              all_correct, elapsed_secs, created_at
       FROM math_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        operation: r.operation,
        durationSecs: r.duration_secs,
        totalProblems: r.total_problems,
        correctCount: r.correct_count,
        allCorrect: r.all_correct,
        elapsedSecs: r.elapsed_secs,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    console.error("GET /api/math/sessions error:", err);
    res.status(500).json({ error: "Failed to load math sessions" });
  }
});
