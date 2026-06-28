import { Router } from "express";
import pool from "../db.js";

export const wordsRouter = Router();

// GET /api/words?app=spelling&grade=6
// Returns words for the given app and grade level
wordsRouter.get("/", async (req, res) => {
  try {
    const app = (req.query.app as string) ?? "spelling";
    const grade = parseFloat((req.query.grade as string) ?? "6");

    const result = await pool.query(
      `SELECT id, word, grade, definition, example, syllables, pronunciation_override
       FROM words
       WHERE app = $1 AND grade = $2
       ORDER BY RANDOM()`,
      [app, grade],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/words error:", err);
    res.status(500).json({ error: "Failed to load words" });
  }
});
