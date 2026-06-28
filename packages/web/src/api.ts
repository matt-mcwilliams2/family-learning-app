export interface WordFromApi {
  id: number;
  word: string;
  grade: number;
  definition: string;
  example: string | null;
  syllables: string | null;
  pronunciationOverride: string | null;
  masteryScore?: number;
  // Legacy snake_case aliases for backward compat
  pronunciation_override?: string | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export interface Stats {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  lastActive: string | null;
}

export interface AttemptResult {
  attemptId: number;
  createdAt: string;
  pointsAwarded: number;
  masteryScore: number;
  hasEverMissed: boolean;
  nextReviewAt: string;
  newBadges?: Array<{ id: string; name: string; description: string; icon: string }>;
}

export interface PlacementStatus {
  taken: boolean;
  placementLevel: number | null;
  currentLevel: number;
}

export interface PlacementQuiz {
  totalWords: number;
  words: WordFromApi[];
}

export interface PlacementScoreResult {
  placementLevel: number;
  totalCorrect: number;
  totalWords: number;
  overallAccuracy: number;
  bandScores: Array<{
    grade: number;
    correct: number;
    total: number;
    accuracy: number;
  }>;
}

export interface SessionWords {
  mode: string;
  currentLevel: number;
  wordCount: number;
  words: WordFromApi[];
}

export interface SessionResult {
  sessionId: number;
  createdAt: string;
  accuracy: number;
  levelBefore: number;
  levelAfter: number;
  levelDirection: "up" | "down" | "hold";
  newBadges?: Array<{ id: string; name: string; description: string; icon: string }>;
}

// Hardcoded for now — single seeded child. Real auth comes in a later slice.
const USER_ID = 1;

export function getUserId(): number {
  return USER_ID;
}

export async function fetchWords(): Promise<WordFromApi[]> {
  const res = await fetch("/api/words?app=spelling&grade=6");
  if (!res.ok) throw new Error("Failed to load words");
  return res.json();
}

export async function fetchSessionWords(
  mode: "learn" | "practice" | "test",
  limit = 10,
): Promise<SessionWords> {
  const res = await fetch(
    `/api/words/session/${USER_ID}?app=spelling&mode=${mode}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("Failed to load session words");
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`/api/stats/${USER_ID}?app=spelling`);
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

export async function postAttempt(params: {
  wordId: number;
  correct: boolean;
  answerGiven: string;
  exerciseType?: string;
  mode?: string;
}): Promise<AttemptResult> {
  const res = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      wordId: params.wordId,
      app: "spelling",
      exerciseType: params.exerciseType ?? "hear_and_spell",
      mode: params.mode ?? "practice",
      correct: params.correct,
      answerGiven: params.answerGiven,
    }),
  });
  if (!res.ok) throw new Error("Failed to record attempt");
  return res.json();
}

export async function postSession(params: {
  mode: "learn" | "practice" | "test";
  totalWords: number;
  correctCount: number;
}): Promise<SessionResult> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      app: "spelling",
      mode: params.mode,
      totalWords: params.totalWords,
      correctCount: params.correctCount,
    }),
  });
  if (!res.ok) throw new Error("Failed to record session");
  return res.json();
}

// Placement
export async function fetchPlacementStatus(): Promise<PlacementStatus> {
  const res = await fetch(`/api/placement/${USER_ID}/status`);
  if (!res.ok) throw new Error("Failed to check placement status");
  return res.json();
}

export async function fetchPlacementQuiz(): Promise<PlacementQuiz> {
  const res = await fetch(`/api/placement/${USER_ID}/quiz`);
  if (!res.ok) throw new Error("Failed to load placement quiz");
  return res.json();
}

export async function scorePlacement(
  results: Array<{ wordId: number; grade: number; correct: boolean }>,
): Promise<PlacementScoreResult> {
  const res = await fetch(`/api/placement/${USER_ID}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error("Failed to score placement");
  return res.json();
}

export async function fetchBadges(): Promise<Badge[]> {
  const res = await fetch(`/api/badges/${USER_ID}?app=spelling`);
  if (!res.ok) throw new Error("Failed to load badges");
  return res.json();
}
