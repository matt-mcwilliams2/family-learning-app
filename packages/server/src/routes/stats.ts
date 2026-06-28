import { Router } from "express";
import pool from "../db.js";

export const statsRouter = Router();

// GET /api/stats/:userId?app=spelling
statsRouter.get("/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";

    const result = await pool.query(
      `SELECT total_points, current_streak, longest_streak, last_active
       FROM user_stats
       WHERE user_id = $1 AND app = $2`,
      [userId, app],
    );

    if (result.rows.length === 0) {
      res.json({
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastActive: null,
      });
      return;
    }

    const row = result.rows[0];
    res.json({
      totalPoints: row.total_points,
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastActive: row.last_active,
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});
