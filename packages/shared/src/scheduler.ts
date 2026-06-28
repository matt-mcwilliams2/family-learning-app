/**
 * Spaced repetition scheduler.
 *
 * Reads the mastery score to decide when a word comes back. Low score →
 * short interval, high priority. High score → long interval, down to
 * once every few months at mastery 10. Words that have been missed before
 * get a shorter interval than words that have never been missed, so weak
 * spots resurface first.
 */

/** Base review intervals in days, indexed by mastery score floor. */
const INTERVAL_TABLE: readonly number[] = [
  0, //  0 — every session
  0, //  1 — every session
  1, //  2 — daily
  2, //  3 — every 2 days
  3, //  4 — every 3 days
  5, //  5 — every 5 days
  7, //  6 — weekly
  14, //  7 — biweekly
  21, //  8 — 3 weeks
  45, //  9 — 6 weeks
  90, // 10 — 3 months
];

/**
 * Multiplier applied to the interval for words the student has missed
 * before. A value less than 1 shortens the interval so weak spots come
 * back sooner.
 */
const MISSED_BEFORE_MULTIPLIER = 0.6;

/**
 * Return the review interval in days for a given mastery score.
 *
 * @param mastery     Current mastery score, 0–10.
 * @param hasEverMissed  True if the student has ever gotten this word wrong.
 */
export function getReviewIntervalDays(
  mastery: number,
  hasEverMissed: boolean,
): number {
  const index = Math.min(Math.floor(mastery), 10);
  let interval = INTERVAL_TABLE[index];

  // Words with a history of misses get shorter intervals
  if (hasEverMissed && interval > 0) {
    interval = Math.max(1, Math.floor(interval * MISSED_BEFORE_MULTIPLIER));
  }

  return interval;
}

/**
 * Compute the next review date for a word.
 *
 * @param mastery         Current mastery score.
 * @param hasEverMissed   True if the student has ever gotten this word wrong.
 * @param lastAttemptDate The timestamp of the most recent attempt.
 * @returns               The earliest date the word should next appear.
 */
export function getNextReviewDate(
  mastery: number,
  hasEverMissed: boolean,
  lastAttemptDate: Date,
): Date {
  const intervalDays = getReviewIntervalDays(mastery, hasEverMissed);
  const next = new Date(lastAttemptDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

/**
 * Priority score for ordering words within a session. Higher number =
 * higher priority (should appear sooner).
 *
 * Words that are overdue get boosted. Words with low mastery get boosted.
 * Words that have been missed before get a bonus.
 *
 * @param mastery        Current mastery score, 0–10.
 * @param hasEverMissed  Has the student ever missed this word?
 * @param nextReviewAt   When the word is next due for review.
 * @param now            Current timestamp (default: now).
 */
export function getReviewPriority(
  mastery: number,
  hasEverMissed: boolean,
  nextReviewAt: Date,
  now: Date = new Date(),
): number {
  // Base priority: lower mastery = higher priority
  let priority = 10 - mastery;

  // Overdue bonus: each day overdue adds 1 point of priority
  const overdueDays =
    (now.getTime() - nextReviewAt.getTime()) / (1000 * 60 * 60 * 24);
  if (overdueDays > 0) {
    priority += Math.min(overdueDays, 10); // cap at +10
  }

  // Previously-missed words get extra weight
  if (hasEverMissed) {
    priority += 2;
  }

  return Math.round(priority * 10) / 10;
}
