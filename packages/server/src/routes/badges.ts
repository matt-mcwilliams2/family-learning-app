import { Router } from "express";
import type { PoolClient } from "pg";
import pool from "../db.js";

export const badgesRouter = Router();

// ── Badge definitions ───────────────────────────────────────────
// Keep in code so adding new badges is a one-line change.

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const MASTERY_THRESHOLD = 8; // mastery_score >= this counts as "mastered"

const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_10_mastered",
    name: "First 10 Words",
    description: "Master your first 10 spelling words",
    icon: "star",
  },
  {
    id: "first_25_mastered",
    name: "Word Collector",
    description: "Master 25 spelling words",
    icon: "books",
  },
  {
    id: "first_50_mastered",
    name: "Word Scholar",
    description: "Master 50 spelling words",
    icon: "graduation",
  },
  {
    id: "first_100_mastered",
    name: "Word Master",
    description: "Master 100 spelling words",
    icon: "trophy",
  },
  {
    id: "perfect_test",
    name: "Perfect Score",
    description: "Get 100% on a spelling test",
    icon: "hundred",
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "Practice 7 days in a row",
    icon: "fire",
  },
  {
    id: "streak_30",
    name: "Month Master",
    description: "Practice 30 days in a row",
    icon: "flame",
  },
  {
    id: "grade_clear_4",
    name: "Grade 4 Champion",
    description: "Master all grade 4 words",
    icon: "badge",
  },
  {
    id: "grade_clear_5",
    name: "Grade 5 Champion",
    description: "Master all grade 5 words",
    icon: "badge",
  },
  {
    id: "grade_clear_6",
    name: "Grade 6 Champion",
    description: "Master all grade 6 words",
    icon: "badge",
  },
  {
    id: "grade_clear_7",
    name: "Grade 7 Champion",
    description: "Master all grade 7 words",
    icon: "badge",
  },
  {
    id: "grade_clear_8",
    name: "Grade 8 Champion",
    description: "Master all grade 8 words",
    icon: "badge",
  },
  {
    id: "grade_clear_9",
    name: "Grade 9 Champion",
    description: "Master all grade 9 words",
    icon: "badge",
  },
];

const BADGE_MAP = new Map(BADGE_DEFS.map((b) => [b.id, b]));

// ── Check and award badges ──────────────────────────────────────
// Called after attempts and sessions. Returns only *newly* earned badges.

export async function checkAndAwardBadges(
  client: PoolClient,
  userId: number,
  app: string,
  context: {
    type: "attempt" | "session";
    accuracy?: number;
    mode?: string;
  },
): Promise<BadgeDef[]> {
  // Fetch already-earned badge IDs
  const earnedResult = await client.query(
    "SELECT badge_id FROM user_badges WHERE user_id = $1 AND app = $2",
    [userId, app],
  );
  const earned = new Set<string>(earnedResult.rows.map((r: any) => r.badge_id));
  const newBadges: BadgeDef[] = [];

  async function award(badgeId: string) {
    const def = BADGE_MAP.get(badgeId);
    if (!def || earned.has(badgeId)) return;
    await client.query(
      "INSERT INTO user_badges (user_id, badge_id, app) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [userId, badgeId, app],
    );
    earned.add(badgeId);
    newBadges.push(def);
  }

  // ── Words-mastered badges ──
  const masteredResult = await client.query(
    "SELECT COUNT(*)::int AS cnt FROM word_mastery WHERE user_id = $1 AND app = $2 AND mastery_score >= $3",
    [userId, app, MASTERY_THRESHOLD],
  );
  const masteredCount: number = masteredResult.rows[0].cnt;

  if (masteredCount >= 10) await award("first_10_mastered");
  if (masteredCount >= 25) await award("first_25_mastered");
  if (masteredCount >= 50) await award("first_50_mastered");
  if (masteredCount >= 100) await award("first_100_mastered");

  // ── Streak badges ──
  const statsResult = await client.query(
    "SELECT current_streak FROM user_stats WHERE user_id = $1 AND app = $2",
    [userId, app],
  );
  if (statsResult.rows.length > 0) {
    const streak: number = statsResult.rows[0].current_streak;
    if (streak >= 7) await award("streak_7");
    if (streak >= 30) await award("streak_30");
  }

  // ── Perfect test badge ──
  if (
    context.type === "session" &&
    context.mode === "test" &&
    context.accuracy != null &&
    context.accuracy >= 1
  ) {
    await award("perfect_test");
  }

  // ── Grade-cleared badges ──
  // Only check grades we haven't already cleared
  for (let grade = 4; grade <= 9; grade++) {
    const badgeId = `grade_clear_${grade}`;
    if (earned.has(badgeId)) continue;

    const gradeResult = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN wm.mastery_score >= $3 THEN 1 END)::int AS mastered
       FROM words w
       LEFT JOIN word_mastery wm
         ON wm.word_id = w.id AND wm.user_id = $1 AND wm.app = $2
       WHERE w.app = $2 AND w.grade = $4`,
      [userId, app, MASTERY_THRESHOLD, grade],
    );

    const { total, mastered } = gradeResult.rows[0];
    if (total > 0 && mastered >= total) {
      await award(badgeId);
    }
  }

  return newBadges;
}

// ── GET /api/badges/:userId ─────────────────────────────────────
// Returns all earned badges for the user with their definitions.

badgesRouter.get("/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const app = (req.query.app as string) ?? "spelling";

    const result = await pool.query(
      "SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1 AND app = $2 ORDER BY earned_at ASC",
      [userId, app],
    );

    const badges = result.rows
      .map((r: any) => {
        const def = BADGE_MAP.get(r.badge_id);
        if (!def) return null;
        return {
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          earnedAt: r.earned_at,
        };
      })
      .filter(Boolean);

    res.json(badges);
  } catch (err) {
    console.error("GET /api/badges error:", err);
    res.status(500).json({ error: "Failed to load badges" });
  }
});
