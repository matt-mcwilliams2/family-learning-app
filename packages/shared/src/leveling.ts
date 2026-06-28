/**
 * Adaptive leveling.
 *
 * The student's level moves in half steps (6.0, 6.5, 7.0, …).
 * All thresholds live in LEVELING_CONFIG so they can be tuned in one
 * place once real data comes in.
 */

export const LEVELING_CONFIG = {
  /** Accuracy at or above this triggers a level-up. */
  levelUpThreshold: 0.9,
  /** Accuracy below this triggers a level-down. */
  levelDownThreshold: 0.8,
  /** How far to move on each adjustment. */
  levelStep: 0.5,
  /** Lowest allowed level. */
  minLevel: 1.0,
  /** Highest allowed level. */
  maxLevel: 12.0,
  /**
   * How many recent sessions (or a weekly test) to consider when
   * deciding whether to adjust. A weekly test counts on its own.
   */
  windowSize: 2,
} as const;

export type LevelingConfig = typeof LEVELING_CONFIG;

export interface LevelAdjustment {
  /** The new level after adjustment. */
  newLevel: number;
  /** The direction of change: "up", "down", or "hold". */
  direction: "up" | "down" | "hold";
  /** The accuracy value that drove the decision. */
  accuracy: number;
}

/**
 * Given the student's current level and their recent accuracy, decide
 * the new level.
 *
 * @param currentLevel  Current level (e.g. 6.5).
 * @param accuracy      Accuracy as a fraction 0.0–1.0 (e.g. 0.92).
 * @param config        Thresholds (uses defaults if omitted).
 */
export function computeLevelAdjustment(
  currentLevel: number,
  accuracy: number,
  config: LevelingConfig = LEVELING_CONFIG,
): LevelAdjustment {
  if (accuracy >= config.levelUpThreshold) {
    const newLevel = Math.min(
      currentLevel + config.levelStep,
      config.maxLevel,
    );
    return {
      newLevel,
      direction: newLevel > currentLevel ? "up" : "hold",
      accuracy,
    };
  }

  if (accuracy < config.levelDownThreshold) {
    const newLevel = Math.max(
      currentLevel - config.levelStep,
      config.minLevel,
    );
    return {
      newLevel,
      direction: newLevel < currentLevel ? "down" : "hold",
      accuracy,
    };
  }

  return { newLevel: currentLevel, direction: "hold", accuracy };
}

/**
 * Compute the combined accuracy across multiple sessions.
 *
 * @param sessions  Array of { correctCount, totalWords } objects.
 * @returns         Combined accuracy as a fraction 0.0–1.0.
 */
export function combinedAccuracy(
  sessions: Array<{ correctCount: number; totalWords: number }>,
): number {
  const totalCorrect = sessions.reduce((s, r) => s + r.correctCount, 0);
  const totalWords = sessions.reduce((s, r) => s + r.totalWords, 0);
  if (totalWords === 0) return 0;
  return totalCorrect / totalWords;
}
