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

// GET /api/words/session/:userId
// Returns a set of words for a session based on mode.
// Query params: app, mode (learn|practice|test), limit (default 10)
//
// Learn:    new words the student hasn't been introduced to yet (< 2 exercise types)
// Practice: mix of review-due words + current-level words
// Test:     current-level words (graded)
wordsRouter.get("/session/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";
    const mode = (req.query.mode as string) ?? "practice";
    const limit = Math.min(
      parseInt((req.query.limit as string) ?? "10", 10),
      40,
    );

    // Get the student's current level
    const userResult = await pool.query(
      "SELECT current_level FROM users WHERE id = $1",
      [userId],
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const currentLevel = parseFloat(userResult.rows[0].current_level);

    // Grade range: current level floor and ceil (e.g., 6.5 → grades 6 and 7)
    const gradeLow = Math.floor(currentLevel);
    const gradeHigh = Math.ceil(currentLevel);

    const familyId = req.auth!.familyId as number;

    let words: any[] = [];

    if (mode === "learn") {
      // Learn mode: words the student hasn't seen in 2+ exercise types yet.
      // Prefer words they've never attempted at all, then partially introduced.
      words = await getLearnWords(userId, app, gradeLow, gradeHigh, limit, familyId);
    } else if (mode === "practice") {
      // Practice mode: mix of review-due words + fresh current-level words.
      words = await getPracticeWords(userId, app, gradeLow, gradeHigh, limit, familyId);
    } else if (mode === "test") {
      // Test mode: current-level words for a graded test.
      words = await getTestWords(userId, app, gradeLow, gradeHigh, limit, familyId);
    } else {
      res.status(400).json({ error: "Invalid mode. Use learn, practice, or test." });
      return;
    }

    res.json({
      mode,
      currentLevel,
      wordCount: words.length,
      words,
    });
  } catch (err) {
    console.error("GET /api/words/session error:", err);
    res.status(500).json({ error: "Failed to load session words" });
  }
});

async function getLearnWords(
  userId: number,
  app: string,
  gradeLow: number,
  gradeHigh: number,
  limit: number,
  familyId: number,
): Promise<any[]> {
  // Words not yet introduced (seen in < 2 exercise types).
  // First, words with no attempts at all, then partially introduced.
  const result = await pool.query(
    `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
            w.pronunciation_override,
            COALESCE(wi.introduced, false) AS introduced,
            COALESCE(array_length(wi.exercise_types, 1), 0) AS types_seen,
            COALESCE(wm.mastery_score, 0) AS mastery_score
     FROM words w
     LEFT JOIN word_introductions wi
       ON wi.word_id = w.id AND wi.user_id = $1 AND wi.app = $2
     LEFT JOIN word_mastery wm
       ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
     LEFT JOIN excluded_words ew
       ON ew.word_id = w.id AND ew.child_id = $1
     WHERE w.app = $2
       AND w.grade >= $3 AND w.grade <= $4
       AND (w.family_id IS NULL OR w.family_id = $6)
       AND ew.word_id IS NULL
       AND COALESCE(wi.introduced, false) = false
     ORDER BY
       COALESCE(array_length(wi.exercise_types, 1), 0) ASC,
       RANDOM()
     LIMIT $5`,
    [userId, app, gradeLow, gradeHigh, limit, familyId],
  );
  return formatWords(result.rows);
}

async function getPracticeWords(
  userId: number,
  app: string,
  gradeLow: number,
  gradeHigh: number,
  limit: number,
  familyId: number,
): Promise<any[]> {
  const now = new Date();

  // First half: review-due words (from mastery scheduler), excluding removed words
  const reviewLimit = Math.ceil(limit * 0.6);
  const reviewResult = await pool.query(
    `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
            w.pronunciation_override,
            COALESCE(wm.mastery_score, 0) AS mastery_score, wm.has_ever_missed
     FROM word_mastery wm
     JOIN words w ON w.id = wm.word_id
     LEFT JOIN excluded_words ew ON ew.word_id = w.id AND ew.child_id = $1
     WHERE wm.user_id = $1 AND wm.app = $2
       AND wm.next_review_at <= $3
       AND (w.family_id IS NULL OR w.family_id = $5)
       AND ew.word_id IS NULL
     ORDER BY wm.mastery_score ASC, wm.next_review_at ASC
     LIMIT $4`,
    [userId, app, now, reviewLimit, familyId],
  );

  const reviewWords = formatWords(reviewResult.rows);
  const reviewIds = new Set(reviewWords.map((w: any) => w.id));

  // Fill remaining with introduced words at current level that aren't
  // already in the review set
  const fillLimit = limit - reviewWords.length;
  let fillWords: any[] = [];

  if (fillLimit > 0) {
    const fillResult = await pool.query(
      `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
              w.pronunciation_override,
              COALESCE(wm.mastery_score, 0) AS mastery_score
       FROM words w
       LEFT JOIN word_introductions wi
         ON wi.word_id = w.id AND wi.user_id = $1 AND wi.app = $2
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
       LEFT JOIN excluded_words ew
         ON ew.word_id = w.id AND ew.child_id = $1
       WHERE w.app = $2
         AND w.grade >= $3 AND w.grade <= $4
         AND (w.family_id IS NULL OR w.family_id = $6)
         AND ew.word_id IS NULL
         AND COALESCE(wi.introduced, false) = true
       ORDER BY RANDOM()
       LIMIT $5`,
      [userId, app, gradeLow, gradeHigh, fillLimit + 10, familyId],
    );

    fillWords = formatWords(fillResult.rows).filter(
      (w: any) => !reviewIds.has(w.id),
    ).slice(0, fillLimit);
  }

  // If still not enough, add any current-level words
  const combined = [...reviewWords, ...fillWords];
  if (combined.length < limit) {
    const extraLimit = limit - combined.length;
    const existingIds = new Set(combined.map((w: any) => w.id));
    const extraResult = await pool.query(
      `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
              w.pronunciation_override,
              COALESCE(wm.mastery_score, 0) AS mastery_score
       FROM words w
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
       LEFT JOIN excluded_words ew
         ON ew.word_id = w.id AND ew.child_id = $1
       WHERE w.app = $2 AND w.grade >= $3 AND w.grade <= $4
         AND (w.family_id IS NULL OR w.family_id = $6)
         AND ew.word_id IS NULL
       ORDER BY RANDOM()
       LIMIT $5`,
      [userId, app, gradeLow, gradeHigh, extraLimit + 10, familyId],
    );
    const extras = formatWords(extraResult.rows).filter(
      (w: any) => !existingIds.has(w.id),
    ).slice(0, extraLimit);
    combined.push(...extras);
  }

  return combined;
}

async function getTestWords(
  userId: number,
  app: string,
  gradeLow: number,
  gradeHigh: number,
  limit: number,
  familyId: number,
): Promise<any[]> {
  // Test mode: pull introduced words at the current level.
  // Prefer words the student has practiced but not yet tested.
  const result = await pool.query(
    `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
            w.pronunciation_override,
            COALESCE(wm.mastery_score, 0) AS mastery_score
     FROM words w
     LEFT JOIN word_introductions wi
       ON wi.word_id = w.id AND wi.user_id = $1 AND wi.app = $2
     LEFT JOIN word_mastery wm
       ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
     LEFT JOIN excluded_words ew
       ON ew.word_id = w.id AND ew.child_id = $1
     WHERE w.app = $2
       AND w.grade >= $3 AND w.grade <= $4
       AND (w.family_id IS NULL OR w.family_id = $6)
       AND ew.word_id IS NULL
       AND COALESCE(wi.introduced, false) = true
     ORDER BY RANDOM()
     LIMIT $5`,
    [userId, app, gradeLow, gradeHigh, limit, familyId],
  );

  // If not enough introduced words, fill with any at the right grade
  const words = formatWords(result.rows);
  if (words.length < limit) {
    const existingIds = new Set(words.map((w: any) => w.id));
    const fillResult = await pool.query(
      `SELECT w.id, w.word, w.grade, w.definition, w.example, w.syllables,
              w.pronunciation_override,
              COALESCE(wm.mastery_score, 0) AS mastery_score
       FROM words w
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
       LEFT JOIN excluded_words ew
         ON ew.word_id = w.id AND ew.child_id = $1
       WHERE w.app = $2 AND w.grade >= $3 AND w.grade <= $4
         AND (w.family_id IS NULL OR w.family_id = $6)
         AND ew.word_id IS NULL
       ORDER BY RANDOM()
       LIMIT $5`,
      [userId, app, gradeLow, gradeHigh, limit, familyId],
    );
    for (const row of fillResult.rows) {
      if (!existingIds.has(row.id) && words.length < limit) {
        words.push(formatWord(row));
      }
    }
  }

  return words;
}

// GET /api/words/past-mistakes/:userId?wordIds=1,2,3
// Returns past incorrect answers for given words, grouped by word ID.
// Used by the proofreading exercise to generate realistic misspellings.
wordsRouter.get("/past-mistakes/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const wordIdsParam = (req.query.wordIds as string) ?? "";
    const wordIds = wordIdsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (wordIds.length === 0) {
      res.json({});
      return;
    }

    const result = await pool.query(
      `SELECT DISTINCT a.word_id, a.answer_given
       FROM attempts a
       JOIN words w ON w.id = a.word_id
       WHERE a.user_id = $1
         AND a.correct = false
         AND a.word_id = ANY($2::int[])
         AND lower(a.answer_given) != lower(w.word)
       ORDER BY a.word_id`,
      [userId, wordIds],
    );

    const map: Record<number, string[]> = {};
    for (const row of result.rows) {
      if (!map[row.word_id]) map[row.word_id] = [];
      map[row.word_id].push(row.answer_given);
    }

    res.json(map);
  } catch (err) {
    console.error("GET /api/words/past-mistakes error:", err);
    res.status(500).json({ error: "Failed to load past mistakes" });
  }
});

function formatWord(row: any) {
  return {
    id: row.id,
    word: row.word,
    grade: parseFloat(row.grade),
    definition: row.definition,
    example: row.example,
    syllables: row.syllables,
    pronunciationOverride: row.pronunciation_override,
    masteryScore: row.mastery_score != null ? parseFloat(row.mastery_score) : 0,
  };
}

function formatWords(rows: any[]) {
  return rows.map(formatWord);
}
