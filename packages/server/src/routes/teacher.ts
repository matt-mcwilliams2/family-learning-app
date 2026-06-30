import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireParent, hashPassword } from "../auth.js";
import { computeMastery, getNextReviewDate } from "@family-learning/shared";
import type { Attempt } from "@family-learning/shared";

export const teacherRouter = Router();

// ── Auto-fill helpers for custom words ─────────────────────────

async function lookupWordMeta(word: string): Promise<{
  definition: string;
  example: string;
  syllables: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error("Not found");
    const data = await res.json();
    const entry = data[0];
    const meaning = entry.meanings?.[0];
    const def = meaning?.definitions?.[0];

    return {
      definition: def?.definition || `A spelling word`,
      example: def?.example || `Can you spell "${word}"?`,
      syllables: approximateSyllables(word),
    };
  } catch {
    return {
      definition: `A spelling word`,
      example: `Can you spell "${word}"?`,
      syllables: approximateSyllables(word),
    };
  }
}

function approximateSyllables(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;

  const vowels = "aeiouy";
  const isV = (c: string) => vowels.includes(c);
  const breaks: number[] = [];

  for (let i = 1; i < w.length - 1; i++) {
    // VCV: break before the consonant
    if (isV(w[i - 1]) && !isV(w[i]) && i + 1 < w.length && isV(w[i + 1])) {
      breaks.push(i);
    }
    // VCCV: break between the two consonants
    else if (
      i >= 1 &&
      isV(w[i - 1]) &&
      !isV(w[i]) &&
      i + 1 < w.length &&
      !isV(w[i + 1]) &&
      i + 2 < w.length &&
      isV(w[i + 2])
    ) {
      breaks.push(i + 1);
    }
  }

  if (breaks.length === 0) return w;

  // De-duplicate and sort
  const unique = [...new Set(breaks)].sort((a, b) => a - b);
  let result = w.slice(0, unique[0]);
  for (let i = 0; i < unique.length; i++) {
    const end = i + 1 < unique.length ? unique[i + 1] : w.length;
    result += "-" + w.slice(unique[i], end);
  }
  return result;
}

// All teacher routes require parent auth
teacherRouter.use(requireAuth, requireParent);

// ── GET /api/teacher/children ──────────────────────────────────
// List all children in the parent's family with summary stats.
teacherRouter.get("/children", async (req, res) => {
  try {
    const familyId = req.auth!.familyId;

    const result = await pool.query(
      `SELECT u.id, u.display_name, u.current_level, u.weekly_new_words,
              u.placement_level, u.username, u.first_name, u.last_name, u.active,
              us.total_points, us.current_streak, us.longest_streak, us.last_active
       FROM users u
       LEFT JOIN user_stats us ON us.user_id = u.id AND us.app = 'spelling'
       WHERE u.family_id = $1 AND u.role = 'child'
       ORDER BY u.display_name`,
      [familyId],
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        displayName: r.display_name,
        currentLevel: parseFloat(r.current_level),
        weeklyNewWords: r.weekly_new_words,
        totalPoints: r.total_points ?? 0,
        currentStreak: r.current_streak ?? 0,
        longestStreak: r.longest_streak ?? 0,
        lastActive: r.last_active,
        placementTaken: r.placement_level !== null,
        placementLevel: r.placement_level ? parseFloat(r.placement_level) : null,
        username: r.username,
        firstName: r.first_name,
        lastName: r.last_name,
        active: r.active,
      })),
    );
  } catch (err) {
    console.error("GET /api/teacher/children error:", err);
    res.status(500).json({ error: "Failed to load children" });
  }
});

// ── GET /api/teacher/children/:childId/words ───────────────────
// Weekly word list with mastery status per word.
// Returns words at the child's current level + review words, each marked
// mastered (>=8), in_progress (>0 and <8), or struggling (has_ever_missed and <4).
teacherRouter.get("/children/:childId/words", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id, current_level FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const currentLevel = parseFloat(childCheck.rows[0].current_level);
    const gradeLow = Math.floor(currentLevel);
    const gradeHigh = Math.ceil(currentLevel);

    // Get words at current level with mastery info (exclude removed words)
    const result = await pool.query(
      `SELECT w.id, w.word, w.grade, w.definition, w.source,
              COALESCE(wm.mastery_score, 0) AS mastery_score,
              COALESCE(wm.has_ever_missed, false) AS has_ever_missed,
              COALESCE(wm.attempt_count, 0) AS attempt_count,
              wm.last_attempted_at
       FROM words w
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = 'spelling'
       LEFT JOIN excluded_words ew
         ON ew.word_id = w.id AND ew.child_id = $1
       WHERE w.app = 'spelling'
         AND w.grade >= $2 AND w.grade <= $3
         AND (w.family_id IS NULL OR w.family_id = $4)
         AND ew.word_id IS NULL
       ORDER BY
         CASE
           WHEN COALESCE(wm.mastery_score, 0) >= 8 THEN 2
           WHEN COALESCE(wm.has_ever_missed, false) AND COALESCE(wm.mastery_score, 0) < 4 THEN 0
           ELSE 1
         END,
         w.word`,
      [childId, gradeLow, gradeHigh, familyId],
    );

    res.json(
      result.rows.map((r: any) => {
        const score = parseFloat(r.mastery_score);
        const hasEverMissed = r.has_ever_missed;
        let status: string;
        if (score >= 8) {
          status = "mastered";
        } else if (hasEverMissed && score < 4) {
          status = "struggling";
        } else if (r.attempt_count > 0) {
          status = "in_progress";
        } else {
          status = "not_started";
        }
        return {
          id: r.id,
          word: r.word,
          grade: parseFloat(r.grade),
          definition: r.definition,
          source: r.source,
          masteryScore: score,
          hasEverMissed,
          attemptCount: r.attempt_count,
          lastAttemptedAt: r.last_attempted_at,
          status,
        };
      }),
    );
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/words error:", err);
    res.status(500).json({ error: "Failed to load word list" });
  }
});

// ── GET /api/teacher/children/:childId/tests ───────────────────
// Test scores with per-word breakdown.
teacherRouter.get("/children/:childId/tests", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 50);

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Get test sessions
    const sessions = await pool.query(
      `SELECT id, mode, total_words, correct_count, accuracy,
              level_at_start, level_at_end, created_at
       FROM sessions
       WHERE user_id = $1 AND app = 'spelling' AND mode = 'test'
       ORDER BY created_at DESC
       LIMIT $2`,
      [childId, limit],
    );

    // For each test session, get the per-word breakdown from attempts
    const tests = [];
    for (const session of sessions.rows) {
      // Get attempts that fall within this test session's timeframe
      // We find attempts in test mode near the session time
      const attempts = await pool.query(
        `SELECT a.id AS attempt_id, a.word_id, a.correct, a.answer_given,
                w.word, w.grade, w.pronunciation_override
         FROM attempts a
         JOIN words w ON w.id = a.word_id
         WHERE a.user_id = $1
           AND a.app = 'spelling'
           AND a.mode = 'test'
           AND a.exercise_type = 'hear_and_spell'
           AND a.created_at >= ($2::timestamptz - interval '1 hour')
           AND a.created_at <= ($2::timestamptz + interval '1 minute')
         ORDER BY a.created_at ASC`,
        [childId, session.created_at],
      );

      tests.push({
        id: session.id,
        totalWords: session.total_words,
        correctCount: session.correct_count,
        accuracy: parseFloat(session.accuracy),
        levelAtStart: parseFloat(session.level_at_start),
        levelAtEnd: parseFloat(session.level_at_end),
        createdAt: session.created_at,
        words: attempts.rows.map((a: any) => ({
          attemptId: a.attempt_id,
          wordId: a.word_id,
          word: a.word,
          grade: parseFloat(a.grade),
          correct: a.correct,
          answerGiven: a.answer_given,
          pronunciationOverride: a.pronunciation_override,
        })),
      });
    }

    res.json(tests);
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/tests error:", err);
    res.status(500).json({ error: "Failed to load test scores" });
  }
});

// ── PUT /api/teacher/children/:childId/weekly-words ────────────
// Set the weekly new-word count for a child.
// Body: { count }
teacherRouter.put("/children/:childId/weekly-words", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const { count } = req.body;

    if (typeof count !== "number" || count < 1 || count > 50) {
      res.status(400).json({ error: "Count must be between 1 and 50" });
      return;
    }

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    await pool.query(
      "UPDATE users SET weekly_new_words = $1 WHERE id = $2",
      [count, childId],
    );

    res.json({ childId, weeklyNewWords: count });
  } catch (err) {
    console.error("PUT /api/teacher/children/:childId/weekly-words error:", err);
    res.status(500).json({ error: "Failed to update weekly word count" });
  }
});

// ── POST /api/teacher/children/:childId/words ──────────────────
// Add a custom word. Auto-fills definition, example, syllables.
teacherRouter.post("/children/:childId/words", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const parentId = req.auth!.userId;
    const { word, grade } = req.body;

    if (!word || typeof word !== "string" || word.trim().length === 0) {
      res.status(400).json({ error: "Word is required" });
      return;
    }

    const wordGrade = typeof grade === "number" ? Math.round(grade * 2) / 2 : 6;

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Check if word already exists (bank or this family's custom)
    const existing = await pool.query(
      "SELECT id FROM words WHERE app = 'spelling' AND LOWER(word) = LOWER($1) AND (family_id IS NULL OR family_id = $2)",
      [word.trim(), familyId],
    );

    if (existing.rows.length > 0) {
      // Un-exclude if it was excluded
      await pool.query(
        "DELETE FROM excluded_words WHERE child_id = $1 AND word_id = $2",
        [childId, existing.rows[0].id],
      );
      res.json({ id: existing.rows[0].id, restored: true });
      return;
    }

    // Auto-fill definition, example, syllables from free dictionary API
    const meta = await lookupWordMeta(word.trim());

    const result = await pool.query(
      `INSERT INTO words (app, word, grade, definition, example, syllables, source, added_by, family_id)
       VALUES ('spelling', $1, $2, $3, $4, $5, 'parent', $6, $7)
       RETURNING id, word, grade, definition, example, syllables`,
      [word.trim(), wordGrade, meta.definition, meta.example, meta.syllables, parentId, familyId],
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      word: row.word,
      grade: parseFloat(row.grade),
      definition: row.definition,
      example: row.example,
      syllables: row.syllables,
    });
  } catch (err) {
    console.error("POST /api/teacher/children/:childId/words error:", err);
    res.status(500).json({ error: "Failed to add word" });
  }
});

// ── DELETE /api/teacher/children/:childId/words/:wordId ────────
// Remove a word from the child's rotation.
teacherRouter.delete("/children/:childId/words/:wordId", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const wordId = parseInt(req.params.wordId, 10);
    const familyId = req.auth!.familyId;

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Exclude the word (works for both bank and parent-added words)
    await pool.query(
      `INSERT INTO excluded_words (child_id, word_id)
       VALUES ($1, $2)
       ON CONFLICT (child_id, word_id) DO NOTHING`,
      [childId, wordId],
    );

    res.json({ removed: true });
  } catch (err) {
    console.error("DELETE /api/teacher/children/:childId/words/:wordId error:", err);
    res.status(500).json({ error: "Failed to remove word" });
  }
});

// ── POST /api/teacher/children/:childId/assign-test ────────────
// Assign a graded test for the child.
teacherRouter.post("/children/:childId/assign-test", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const parentId = req.auth!.userId;
    const wordCount = typeof req.body.wordCount === "number"
      ? Math.max(1, Math.min(40, req.body.wordCount))
      : 10;

    // Verify child belongs to this family
    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Cancel any existing pending tests for this child
    await pool.query(
      "UPDATE assigned_tests SET status = 'completed', completed_at = NOW() WHERE child_id = $1 AND status = 'pending'",
      [childId],
    );

    const result = await pool.query(
      `INSERT INTO assigned_tests (child_id, family_id, assigned_by, word_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id, word_count, status, assigned_at`,
      [childId, familyId, parentId, wordCount],
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      wordCount: row.word_count,
      status: row.status,
      assignedAt: row.assigned_at,
    });
  } catch (err) {
    console.error("POST /api/teacher/children/:childId/assign-test error:", err);
    res.status(500).json({ error: "Failed to assign test" });
  }
});

// ── GET /api/teacher/children/:childId/assigned-tests ──────────
// List assigned tests (pending and recent completed).
teacherRouter.get("/children/:childId/assigned-tests", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const result = await pool.query(
      `SELECT at.id, at.word_count, at.status, at.assigned_at, at.completed_at,
              s.accuracy, s.correct_count, s.total_words,
              s.level_at_start, s.level_at_end
       FROM assigned_tests at
       LEFT JOIN sessions s ON s.id = at.session_id
       WHERE at.child_id = $1 AND at.family_id = $2
       ORDER BY at.assigned_at DESC
       LIMIT 20`,
      [childId, familyId],
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        wordCount: r.word_count,
        status: r.status,
        assignedAt: r.assigned_at,
        completedAt: r.completed_at,
        accuracy: r.accuracy ? parseFloat(r.accuracy) : null,
        correctCount: r.correct_count,
        totalWords: r.total_words,
        levelAtStart: r.level_at_start ? parseFloat(r.level_at_start) : null,
        levelAtEnd: r.level_at_end ? parseFloat(r.level_at_end) : null,
      })),
    );
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/assigned-tests error:", err);
    res.status(500).json({ error: "Failed to load assigned tests" });
  }
});

// ── POST /api/teacher/children/:childId/placement ──────────────
// Trigger or re-trigger the placement quiz for a child.
teacherRouter.post("/children/:childId/placement", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const { grade } = req.body;

    const childCheck = await pool.query(
      "SELECT id, display_name, placement_level FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Reset placement_level to NULL so the child sees the quiz
    // Optionally set current_level to the entered grade
    if (typeof grade === "number" && grade >= 1 && grade <= 12) {
      await pool.query(
        "UPDATE users SET placement_level = NULL, current_level = $1 WHERE id = $2",
        [grade, childId],
      );
    } else {
      await pool.query(
        "UPDATE users SET placement_level = NULL WHERE id = $1",
        [childId],
      );
    }

    res.json({
      triggered: true,
      childName: childCheck.rows[0].display_name,
    });
  } catch (err) {
    console.error("POST /api/teacher/children/:childId/placement error:", err);
    res.status(500).json({ error: "Failed to trigger placement" });
  }
});

// ── GET /api/teacher/children/:childId/sessions ────────────────
// All session history (learn, practice, test) for a child.
teacherRouter.get("/children/:childId/sessions", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 50);

    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const result = await pool.query(
      `SELECT id, mode, total_words, correct_count, accuracy,
              level_at_start, level_at_end, created_at
       FROM sessions
       WHERE user_id = $1 AND app = 'spelling'
       ORDER BY created_at DESC
       LIMIT $2`,
      [childId, limit],
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
    console.error("GET /api/teacher/children/:childId/sessions error:", err);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

// ── GET /api/teacher/children/:childId/trouble-words ──────────
// Words the child keeps missing, pulled from the attempt log.
teacherRouter.get("/children/:childId/trouble-words", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    const childCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const result = await pool.query(
      `SELECT w.id, w.word, w.grade, w.definition,
              COUNT(*) FILTER (WHERE a.correct = false) AS miss_count,
              COUNT(*) AS total_attempts,
              ROUND(
                COUNT(*) FILTER (WHERE a.correct = false)::numeric
                / GREATEST(COUNT(*)::numeric, 1), 2
              ) AS miss_rate,
              COALESCE(wm.mastery_score, 0) AS mastery_score
       FROM attempts a
       JOIN words w ON w.id = a.word_id
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = a.user_id AND wm.app = 'spelling'
       LEFT JOIN excluded_words ew
         ON ew.word_id = w.id AND ew.child_id = $1
       WHERE a.user_id = $1
         AND a.app = 'spelling'
         AND ew.word_id IS NULL
       GROUP BY w.id, w.word, w.grade, w.definition, wm.mastery_score
       HAVING COUNT(*) FILTER (WHERE a.correct = false) >= 2
       ORDER BY miss_rate DESC, miss_count DESC
       LIMIT 10`,
      [childId],
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        word: r.word,
        grade: parseFloat(r.grade),
        definition: r.definition,
        missCount: parseInt(r.miss_count, 10),
        totalAttempts: parseInt(r.total_attempts, 10),
        missRate: parseFloat(r.miss_rate),
        masteryScore: parseFloat(r.mastery_score),
      })),
    );
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/trouble-words error:", err);
    res.status(500).json({ error: "Failed to load trouble words" });
  }
});

// ── POST /api/teacher/excuse-attempt ──────────────────────────
// Excuse a wrong answer: flip attempt to correct, recompute mastery,
// update the session stats.
// Body: { attemptId, childId }
teacherRouter.post("/excuse-attempt", async (req, res) => {
  const client = await pool.connect();
  try {
    const familyId = req.auth!.familyId;
    const { attemptId, childId } = req.body;

    if (typeof attemptId !== "number" || typeof childId !== "number") {
      res.status(400).json({ error: "attemptId and childId are required" });
      return;
    }

    // Verify child belongs to this family
    const childCheck = await client.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (childCheck.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    // Get the attempt and verify it belongs to this child and is currently wrong
    const attemptCheck = await client.query(
      "SELECT id, word_id, correct, mode, created_at FROM attempts WHERE id = $1 AND user_id = $2",
      [attemptId, childId],
    );
    if (attemptCheck.rows.length === 0) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if (attemptCheck.rows[0].correct) {
      res.json({ excused: false, message: "Already marked correct" });
      return;
    }

    const wordId = attemptCheck.rows[0].word_id;
    const attemptTime = attemptCheck.rows[0].created_at;

    await client.query("BEGIN");

    // 1. Flip the attempt to correct
    await client.query(
      "UPDATE attempts SET correct = true WHERE id = $1",
      [attemptId],
    );

    // 2. Recompute mastery for this word
    const attemptsRows = await client.query(
      `SELECT id, user_id, word_id, app, exercise_type, mode, correct,
              answer_given, created_at
       FROM attempts
       WHERE user_id = $1 AND word_id = $2 AND app = 'spelling'
       ORDER BY created_at DESC`,
      [childId, wordId],
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
    const lastAttemptDate = new Date(
      attemptsRows.rows[0]?.created_at ?? attemptTime,
    );
    const nextReview = getNextReviewDate(score, hasEverMissed, lastAttemptDate);

    await client.query(
      `INSERT INTO word_mastery (user_id, word_id, app, mastery_score, has_ever_missed,
                                  attempt_count, next_review_at, last_attempted_at)
       VALUES ($1, $2, 'spelling', $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, word_id, app)
       DO UPDATE SET mastery_score = $3,
                     has_ever_missed = $4,
                     attempt_count = $5,
                     next_review_at = $6,
                     last_attempted_at = $7`,
      [childId, wordId, score, hasEverMissed, attempts.length, nextReview, lastAttemptDate],
    );

    // 3. Update the session that this attempt belonged to
    // Find the session matching this attempt's timeframe
    const sessionMatch = await client.query(
      `SELECT id, correct_count, total_words
       FROM sessions
       WHERE user_id = $1 AND app = 'spelling' AND mode = 'test'
         AND created_at >= ($2::timestamptz - interval '1 minute')
         AND created_at <= ($2::timestamptz + interval '1 hour')
       LIMIT 1`,
      [childId, attemptTime],
    );

    if (sessionMatch.rows.length > 0) {
      const session = sessionMatch.rows[0];
      const newCorrect = session.correct_count + 1;
      const newAccuracy = session.total_words > 0
        ? newCorrect / session.total_words
        : 0;
      await client.query(
        "UPDATE sessions SET correct_count = $1, accuracy = $2 WHERE id = $3",
        [newCorrect, newAccuracy, session.id],
      );
    }

    await client.query("COMMIT");

    res.json({
      excused: true,
      newMasteryScore: score,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/teacher/excuse-attempt error:", err);
    res.status(500).json({ error: "Failed to excuse attempt" });
  } finally {
    client.release();
  }
});

// ── PUT /api/teacher/words/:wordId/pronunciation ──────────────
// Set or clear the pronunciation override for a word.
// Body: { pronunciationOverride }
teacherRouter.put("/words/:wordId/pronunciation", async (req, res) => {
  try {
    const wordId = parseInt(req.params.wordId, 10);
    const familyId = req.auth!.familyId;
    const { pronunciationOverride } = req.body;

    // Verify the word is either a bank word or belongs to this family
    const wordCheck = await pool.query(
      "SELECT id FROM words WHERE id = $1 AND (family_id IS NULL OR family_id = $2)",
      [wordId, familyId],
    );
    if (wordCheck.rows.length === 0) {
      res.status(404).json({ error: "Word not found" });
      return;
    }

    const override =
      typeof pronunciationOverride === "string" && pronunciationOverride.trim()
        ? pronunciationOverride.trim()
        : null;

    await pool.query(
      "UPDATE words SET pronunciation_override = $1 WHERE id = $2",
      [override, wordId],
    );

    res.json({ wordId, pronunciationOverride: override });
  } catch (err) {
    console.error("PUT /api/teacher/words/:wordId/pronunciation error:", err);
    res.status(500).json({ error: "Failed to update pronunciation" });
  }
});

// ── Student management ──────────────────────────────────────────

// POST /api/teacher/students — Create a new student
teacherRouter.post("/students", async (req, res) => {
  try {
    const { firstName, lastName, gradeLevel, username, password } = req.body;
    if (!firstName || !lastName || !username || !password || gradeLevel == null) {
      res.status(400).json({ error: "All fields required: firstName, lastName, gradeLevel, username, password" });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters" });
      return;
    }

    // Check username uniqueness
    const existing = await pool.query(
      "SELECT id FROM users WHERE lower(username) = lower($1)",
      [username.trim()],
    );
    if (existing.rows.length > 0) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }

    const familyId = req.auth!.familyId;
    const displayName = `${firstName.trim()} ${lastName.trim()}`;
    const hashedPassword = await hashPassword(password);
    const level = parseFloat(gradeLevel);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, username, password_hash,
                            first_name, last_name, current_level, active)
         VALUES ($1, $2, 'child', $3, $4, $5, $6, $7, true)
         RETURNING id`,
        [familyId, displayName, username.trim(), hashedPassword,
         firstName.trim(), lastName.trim(), level],
      );
      const childId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO user_stats (user_id, app, total_points, current_streak, longest_streak)
         VALUES ($1, 'spelling', 0, 0, 0)`,
        [childId],
      );

      await client.query("COMMIT");

      res.json({
        id: childId,
        displayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        currentLevel: level,
        active: true,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/teacher/students error:", err);
    res.status(500).json({ error: "Failed to create student" });
  }
});

// PUT /api/teacher/students/:studentId — Edit student info
teacherRouter.put("/students/:studentId", async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const familyId = req.auth!.familyId;
    const { firstName, lastName, gradeLevel, username, password } = req.body;

    if (!firstName || !lastName || !username || gradeLevel == null) {
      res.status(400).json({ error: "firstName, lastName, gradeLevel, username required" });
      return;
    }

    // Verify student belongs to this family
    const check = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [studentId, familyId],
    );
    if (check.rows.length === 0) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    // Check username uniqueness (excluding self)
    const existing = await pool.query(
      "SELECT id FROM users WHERE lower(username) = lower($1) AND id != $2",
      [username.trim(), studentId],
    );
    if (existing.rows.length > 0) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }

    const displayName = `${firstName.trim()} ${lastName.trim()}`;
    const level = parseFloat(gradeLevel);

    if (password && password.length > 0) {
      if (password.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters" });
        return;
      }
      const hashedPassword = await hashPassword(password);
      await pool.query(
        `UPDATE users SET display_name = $1, first_name = $2, last_name = $3,
                          username = $4, password_hash = $5, current_level = $6
         WHERE id = $7`,
        [displayName, firstName.trim(), lastName.trim(),
         username.trim(), hashedPassword, level, studentId],
      );
    } else {
      await pool.query(
        `UPDATE users SET display_name = $1, first_name = $2, last_name = $3,
                          username = $4, current_level = $5
         WHERE id = $6`,
        [displayName, firstName.trim(), lastName.trim(),
         username.trim(), level, studentId],
      );
    }

    res.json({ id: studentId, displayName, firstName: firstName.trim(),
               lastName: lastName.trim(), username: username.trim(),
               currentLevel: level });
  } catch (err) {
    console.error("PUT /api/teacher/students/:studentId error:", err);
    res.status(500).json({ error: "Failed to update student" });
  }
});

// PUT /api/teacher/students/:studentId/deactivate
teacherRouter.put("/students/:studentId/deactivate", async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const familyId = req.auth!.familyId;

    const result = await pool.query(
      "UPDATE users SET active = false WHERE id = $1 AND family_id = $2 AND role = 'child' RETURNING id",
      [studentId, familyId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json({ id: studentId, active: false });
  } catch (err) {
    console.error("PUT /api/teacher/students/:studentId/deactivate error:", err);
    res.status(500).json({ error: "Failed to deactivate student" });
  }
});

// PUT /api/teacher/students/:studentId/activate
teacherRouter.put("/students/:studentId/activate", async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const familyId = req.auth!.familyId;

    const result = await pool.query(
      "UPDATE users SET active = true WHERE id = $1 AND family_id = $2 AND role = 'child' RETURNING id",
      [studentId, familyId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    res.json({ id: studentId, active: true });
  } catch (err) {
    console.error("PUT /api/teacher/students/:studentId/activate error:", err);
    res.status(500).json({ error: "Failed to activate student" });
  }
});

// DELETE /api/teacher/students/:studentId
teacherRouter.delete("/students/:studentId", async (req, res) => {
  const client = await pool.connect();
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const familyId = req.auth!.familyId;

    // Verify student belongs to this family
    const check = await client.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [studentId, familyId],
    );
    if (check.rows.length === 0) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    await client.query("BEGIN");

    // Delete in dependency order
    await client.query("DELETE FROM excluded_words WHERE child_id = $1", [studentId]);
    await client.query("DELETE FROM assigned_tests WHERE child_id = $1", [studentId]);
    await client.query("DELETE FROM user_badges WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM word_introductions WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM word_mastery WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM attempts WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM user_stats WHERE user_id = $1", [studentId]);
    await client.query("DELETE FROM users WHERE id = $1", [studentId]);

    await client.query("COMMIT");
    res.json({ deleted: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/teacher/students/:studentId error:", err);
    res.status(500).json({ error: "Failed to delete student" });
  } finally {
    client.release();
  }
});

// ── Math: teacher endpoints ──────────────────────────────────

// GET /api/teacher/children/:childId/math-sessions
teacherRouter.get("/children/:childId/math-sessions", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    // Verify child belongs to this family
    const child = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (child.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const result = await pool.query(
      `SELECT id, operation, duration_secs, total_problems, correct_count,
              all_correct, elapsed_secs, created_at
       FROM math_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [childId],
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
    console.error("GET /api/teacher/children/:childId/math-sessions error:", err);
    res.status(500).json({ error: "Failed to load math sessions" });
  }
});

// GET /api/teacher/children/:childId/math-records
teacherRouter.get("/children/:childId/math-records", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    const child = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (child.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const result = await pool.query(
      "SELECT operation, best_time_secs, achieved_at FROM math_records WHERE user_id = $1",
      [childId],
    );

    const records: Record<string, { bestTimeSecs: number; achievedAt: string } | null> = {
      addition: null, subtraction: null, multiplication: null, division: null,
    };
    for (const row of result.rows) {
      records[row.operation] = { bestTimeSecs: row.best_time_secs, achievedAt: row.achieved_at };
    }

    res.json(records);
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/math-records error:", err);
    res.status(500).json({ error: "Failed to load math records" });
  }
});

// GET /api/teacher/children/:childId/math-stats
teacherRouter.get("/children/:childId/math-stats", async (req, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const familyId = req.auth!.familyId;

    const child = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND family_id = $2 AND role = 'child'",
      [childId, familyId],
    );
    if (child.rows.length === 0) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const statsResult = await pool.query(
      "SELECT total_points, current_streak, longest_streak, last_active FROM user_stats WHERE user_id = $1 AND app = 'math'",
      [childId],
    );

    const stats = statsResult.rows.length > 0
      ? {
          totalPoints: statsResult.rows[0].total_points,
          currentStreak: statsResult.rows[0].current_streak,
          longestStreak: statsResult.rows[0].longest_streak,
          lastActive: statsResult.rows[0].last_active,
        }
      : { totalPoints: 0, currentStreak: 0, longestStreak: 0, lastActive: null };

    res.json(stats);
  } catch (err) {
    console.error("GET /api/teacher/children/:childId/math-stats error:", err);
    res.status(500).json({ error: "Failed to load math stats" });
  }
});
