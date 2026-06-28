export interface WordFromApi {
  id: number;
  word: string;
  grade: string;
  definition: string;
  example: string | null;
  syllables: string | null;
  pronunciation_override: string | null;
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
}

// Hardcoded for now — single seeded child. Real auth comes in a later slice.
const USER_ID = 1;

export async function fetchWords(): Promise<WordFromApi[]> {
  const res = await fetch("/api/words?app=spelling&grade=6");
  if (!res.ok) throw new Error("Failed to load words");
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
