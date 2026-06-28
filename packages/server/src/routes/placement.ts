import { Router } from "express";
import pool from "../db.js";

export const placementRouter = Router();

/**
 * Grade distribution for the 40-word placement quiz.
 * Spans grades 4-9 to find where the student starts missing words.
 */
const PLACEMENT_DISTRIBUTION: Array<{ grade: number; count: number }> = [
  { grade: 4, count: 6 },
  { grade: 5, count: 7 },
  { grade: 6, count: 8 },
  { grade: 7, count: 7 },
  { grade: 8, count: 6 },
  { grade: 9, count: 6 },
];

// GET /api/placement/:userId/status
// Check if the student has already taken the placement test.
placementRouter.get("/:userId/status", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const result = await pool.query(
      "SELECT placement_level, current_level FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const row = result.rows[0];
    res.json({
      taken: row.placement_level !== null,
      placementLevel: row.placement_level ? parseFloat(row.placement_level) : null,
      currentLevel: parseFloat(row.current_level),
    });
  } catch (err) {
    console.error("GET /api/placement/:userId/status error:", err);
    res.status(500).json({ error: "Failed to check placement status" });
  }
});

// GET /api/placement/:userId/quiz
// Generate a 40-word placement quiz. Returns words in grade order (easiest first).
placementRouter.get("/:userId/quiz", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    // Check if already taken
    const userResult = await pool.query(
      "SELECT placement_level FROM users WHERE id = $1",
      [userId],
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (userResult.rows[0].placement_level !== null) {
      res.status(400).json({ error: "Placement test already taken" });
      return;
    }

    const words: any[] = [];

    for (const band of PLACEMENT_DISTRIBUTION) {
      const result = await pool.query(
        `SELECT id, word, grade, definition, example, syllables, pronunciation_override
         FROM words
         WHERE app = 'spelling' AND grade = $1 AND source = 'bank'
         ORDER BY RANDOM()
         LIMIT $2`,
        [band.grade, band.count],
      );
      words.push(...result.rows);
    }

    // Return in grade order (easiest first)
    words.sort((a, b) => parseFloat(a.grade) - parseFloat(b.grade));

    res.json({
      totalWords: words.length,
      distribution: PLACEMENT_DISTRIBUTION,
      words: words.map((w) => ({
        id: w.id,
        word: w.word,
        grade: parseFloat(w.grade),
        definition: w.definition,
        example: w.example,
        syllables: w.syllables,
        pronunciationOverride: w.pronunciation_override,
      })),
    });
  } catch (err) {
    console.error("GET /api/placement/:userId/quiz error:", err);
    res.status(500).json({ error: "Failed to generate placement quiz" });
  }
});

// POST /api/placement/:userId/score
// Score the placement quiz and set the student's starting level.
// Body: { results: [{ wordId, grade, correct }] }
placementRouter.post("/:userId/score", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = parseInt(req.params.userId, 10);
    const { results } = req.body as {
      results: Array<{ wordId: number; grade: number; correct: boolean }>;
    };

    if (!results || !Array.isArray(results)) {
      res.status(400).json({ error: "results array is required" });
      return;
    }

    await client.query("BEGIN");

    // Record each attempt in test mode
    for (const r of results) {
      await client.query(
        `INSERT INTO attempts (user_id, word_id, app, exercise_type, mode, correct, answer_given)
         VALUES ($1, $2, 'spelling', 'hear_and_spell', 'test', $3, NULL)`,
        [userId, r.wordId, r.correct],
      );
    }

    // Score by grade band
    const bandScores = new Map<number, { correct: number; total: number }>();
    for (const r of results) {
      const band = bandScores.get(r.grade) ?? { correct: 0, total: 0 };
      band.total++;
      if (r.correct) band.correct++;
      bandScores.set(r.grade, band);
    }

    // Find the level where the student starts struggling.
    // Walk from lowest grade up. The placement level is the highest
    // grade where the student scores >= 70%, stepped down by half
    // if the next grade up is < 50%.
    const grades = [...bandScores.keys()].sort((a, b) => a - b);
    let placementLevel = grades[0]; // default to lowest

    for (const grade of grades) {
      const band = bandScores.get(grade)!;
      const accuracy = band.correct / band.total;

      if (accuracy >= 0.7) {
        // Student is comfortable at this grade
        placementLevel = grade;
      } else if (accuracy >= 0.4) {
        // Student is struggling but getting some — place at half-step below
        placementLevel = grade - 0.5;
        break;
      } else {
        // Student is clearly below this level — stop here
        placementLevel = grade - 1;
        break;
      }
    }

    // Clamp to valid range
    placementLevel = Math.max(1.0, Math.min(12.0, placementLevel));
    // Round to nearest 0.5
    placementLevel = Math.round(placementLevel * 2) / 2;

    // Update user
    await client.query(
      "UPDATE users SET placement_level = $1, current_level = $1 WHERE id = $2",
      [placementLevel, userId],
    );

    // Record as a test session
    const totalWords = results.length;
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = correctCount / totalWords;

    await client.query(
      `INSERT INTO sessions (user_id, app, mode, total_words, correct_count,
                              accuracy, level_at_start, level_at_end)
       VALUES ($1, 'spelling', 'test', $2, $3, $4, 6.0, $5)`,
      [userId, totalWords, correctCount, accuracy, placementLevel],
    );

    await client.query("COMMIT");

    // Build per-band summary for the response
    const bandSummary = grades.map((g) => {
      const band = bandScores.get(g)!;
      return {
        grade: g,
        correct: band.correct,
        total: band.total,
        accuracy: Math.round((band.correct / band.total) * 100),
      };
    });

    res.json({
      placementLevel,
      totalCorrect: correctCount,
      totalWords,
      overallAccuracy: Math.round(accuracy * 100),
      bandScores: bandSummary,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/placement/:userId/score error:", err);
    res.status(500).json({ error: "Failed to score placement test" });
  } finally {
    client.release();
  }
});
