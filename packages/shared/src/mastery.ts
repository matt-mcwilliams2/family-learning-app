import type { Attempt } from "./types.js";

/**
 * Mode weights: test attempts count more toward mastery, learn attempts
 * count less. A test answer is a strong signal; a learn-mode answer with
 * hints and replays is a weak one.
 */
const MODE_WEIGHT: Record<string, number> = {
  learn: 0.5,
  practice: 1.0,
  test: 1.5,
};

/**
 * Exponential decay factor applied per position in the recency-sorted
 * attempt list. 0.85 means the second-most-recent attempt carries 85% of
 * the weight of the most recent one, the third carries ~72%, etc.
 */
const RECENCY_DECAY = 0.85;

export interface MasteryResult {
  /** Mastery score, 0.0 to 10.0 (one decimal place). */
  score: number;
  /** True if the student has ever answered this word incorrectly. */
  hasEverMissed: boolean;
}

/**
 * Compute a mastery score from 0 to 10 for a single word, given all of
 * the student's attempts on that word. The score is a weighted success
 * rate where recent attempts and higher-stakes modes carry more weight.
 *
 * - All correct from introduction through test → 10.
 * - All wrong → 0.
 * - Mix → proportional, tilted toward recent performance.
 *
 * The score is recomputable from the raw attempts at any time.
 */
export function computeMastery(attempts: Attempt[]): MasteryResult {
  if (attempts.length === 0) {
    return { score: 0, hasEverMissed: false };
  }

  const hasEverMissed = attempts.some((a) => !a.correct);

  // Sort most-recent first
  const sorted = [...attempts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  let weightedCorrect = 0;
  let totalWeight = 0;

  for (let i = 0; i < sorted.length; i++) {
    const attempt = sorted[i];
    const recencyWeight = Math.pow(RECENCY_DECAY, i);
    const modeWeight = MODE_WEIGHT[attempt.mode] ?? 1.0;
    const weight = recencyWeight * modeWeight;

    if (attempt.correct) {
      weightedCorrect += weight;
    }
    totalWeight += weight;
  }

  const raw = totalWeight > 0 ? (weightedCorrect / totalWeight) * 10 : 0;

  // Round to one decimal place, clamp to [0, 10]
  const score = Math.min(10, Math.max(0, Math.round(raw * 10) / 10));

  return { score, hasEverMissed };
}
