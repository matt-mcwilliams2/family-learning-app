/** A single attempt record, as stored in the attempts table. */
export interface Attempt {
  id: number;
  userId: number;
  wordId: number;
  app: string;
  exerciseType: string;
  mode: "learn" | "practice" | "test";
  correct: boolean;
  answerGiven: string | null;
  createdAt: Date;
}

/** Cached mastery state for one user + word pair. */
export interface WordMastery {
  userId: number;
  wordId: number;
  app: string;
  masteryScore: number;
  hasEverMissed: boolean;
  attemptCount: number;
  nextReviewAt: Date;
  lastAttemptedAt: Date;
}

/** A completed session, used for adaptive leveling. */
export interface Session {
  id: number;
  userId: number;
  app: string;
  mode: "learn" | "practice" | "test";
  totalWords: number;
  correctCount: number;
  accuracy: number;
  levelAtStart: number;
  levelAtEnd: number;
  createdAt: Date;
}
