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

// ── Auth types ──────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  displayName: string;
  role: "parent" | "child" | "admin";
  familyId: number | null;
  currentLevel?: number;
  email?: string;
}

export interface TeacherSummary {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ChildProfile {
  id: number;
  displayName: string;
  currentLevel: number;
}

export interface ChildSummary {
  id: number;
  displayName: string;
  currentLevel: number;
  weeklyNewWords: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  lastActive: string | null;
  placementTaken: boolean;
  placementLevel: number | null;
  username?: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
}

export interface AssignedTest {
  id: number;
  wordCount: number;
  status: "pending" | "completed";
  assignedAt: string;
  completedAt: string | null;
  accuracy: number | null;
  correctCount: number | null;
  totalWords: number | null;
  levelAtStart: number | null;
  levelAtEnd: number | null;
}

export interface PendingTest {
  id: number;
  wordCount: number;
  assignedAt: string;
}

export interface WordStatus {
  id: number;
  word: string;
  grade: number;
  definition: string;
  source: string;
  masteryScore: number;
  hasEverMissed: boolean;
  attemptCount: number;
  lastAttemptedAt: string | null;
  status: "mastered" | "in_progress" | "struggling" | "not_started";
}

export interface TestResult {
  id: number;
  totalWords: number;
  correctCount: number;
  accuracy: number;
  levelAtStart: number;
  levelAtEnd: number;
  createdAt: string;
  words: Array<{
    attemptId: number;
    wordId: number;
    word: string;
    grade: number;
    correct: boolean;
    answerGiven: string;
    pronunciationOverride: string | null;
  }>;
}

export interface TroubleWord {
  id: number;
  word: string;
  grade: number;
  definition: string;
  missCount: number;
  totalAttempts: number;
  missRate: number;
  masteryScore: number;
}

// ── Token management ────────────────────────────────────────────

const TOKEN_KEY = "spelling_auth_token";

let currentUserId: number | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  currentUserId = null;
}

export function setCurrentUserId(id: number): void {
  currentUserId = id;
}

export function getUserId(): number {
  if (!currentUserId) throw new Error("Not authenticated");
  return currentUserId;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ── Auth API ────────────────────────────────────────────────────

export async function fetchProfiles(): Promise<ChildProfile[]> {
  const res = await fetch("/api/auth/profiles");
  if (!res.ok) throw new Error("Failed to load profiles");
  return res.json();
}

export async function loginParent(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function loginChild(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/child-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Invalid username or password");
  }
  return res.json();
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", { headers: authHeaders() });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

// ── Existing child-facing API (now authenticated) ───────────────

export async function fetchWords(): Promise<WordFromApi[]> {
  const res = await fetch("/api/words?app=spelling&grade=6", {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load words");
  return res.json();
}

export async function fetchSessionWords(
  mode: "learn" | "practice" | "test",
  limit = 10,
): Promise<SessionWords> {
  const res = await fetch(
    `/api/words/session/${getUserId()}?app=spelling&mode=${mode}&limit=${limit}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to load session words");
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`/api/stats/${getUserId()}?app=spelling`, {
    headers: authHeaders(),
  });
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
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      userId: getUserId(),
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
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      userId: getUserId(),
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
  const res = await fetch(`/api/placement/${getUserId()}/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to check placement status");
  return res.json();
}

export async function fetchPlacementQuiz(): Promise<PlacementQuiz> {
  const res = await fetch(`/api/placement/${getUserId()}/quiz`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load placement quiz");
  return res.json();
}

export async function scorePlacement(
  results: Array<{ wordId: number; grade: number; correct: boolean }>,
): Promise<PlacementScoreResult> {
  const res = await fetch(`/api/placement/${getUserId()}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error("Failed to score placement");
  return res.json();
}

export async function fetchBadges(): Promise<Badge[]> {
  const res = await fetch(`/api/badges/${getUserId()}?app=spelling`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load badges");
  return res.json();
}

// ── Teacher API ─────────────────────────────────────────────────

export async function fetchChildren(): Promise<ChildSummary[]> {
  const res = await fetch("/api/teacher/children", {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load children");
  return res.json();
}

export async function fetchChildWords(childId: number): Promise<WordStatus[]> {
  const res = await fetch(`/api/teacher/children/${childId}/words`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load word list");
  return res.json();
}

export async function fetchChildTests(childId: number): Promise<TestResult[]> {
  const res = await fetch(`/api/teacher/children/${childId}/tests`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load tests");
  return res.json();
}

export async function setWeeklyWords(
  childId: number,
  count: number,
): Promise<void> {
  const res = await fetch(`/api/teacher/children/${childId}/weekly-words`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error("Failed to update weekly words");
}

// ── Teacher: Word management ───────────────────────────────────

export async function addChildWord(
  childId: number,
  word: string,
  grade: number,
): Promise<{ id: number; word?: string; definition?: string; restored?: boolean }> {
  const res = await fetch(`/api/teacher/children/${childId}/words`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ word, grade }),
  });
  if (!res.ok) throw new Error("Failed to add word");
  return res.json();
}

export async function deleteChildWord(
  childId: number,
  wordId: number,
): Promise<void> {
  const res = await fetch(`/api/teacher/children/${childId}/words/${wordId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to remove word");
}

// ── Teacher: Test assignment ───────────────────────────────────

export async function assignTest(
  childId: number,
  wordCount: number,
): Promise<AssignedTest> {
  const res = await fetch(`/api/teacher/children/${childId}/assign-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ wordCount }),
  });
  if (!res.ok) throw new Error("Failed to assign test");
  return res.json();
}

export async function fetchAssignedTests(
  childId: number,
): Promise<AssignedTest[]> {
  const res = await fetch(`/api/teacher/children/${childId}/assigned-tests`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load assigned tests");
  return res.json();
}

// ── Teacher: Placement ─────────────────────────────────────────

export async function triggerPlacement(
  childId: number,
  grade?: number,
): Promise<{ triggered: boolean; childName: string }> {
  const res = await fetch(`/api/teacher/children/${childId}/placement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ grade }),
  });
  if (!res.ok) throw new Error("Failed to trigger placement");
  return res.json();
}

// ── Child: Assigned test ───────────────────────────────────────

export async function fetchPendingTest(): Promise<PendingTest | null> {
  const res = await fetch("/api/assigned-tests/pending", {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to check for pending test");
  return res.json();
}

export async function completeAssignedTest(
  testId: number,
  sessionId: number,
): Promise<void> {
  const res = await fetch(`/api/assigned-tests/${testId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error("Failed to complete assigned test");
}

// ── Teacher: Trouble words ────────────────────────────────────

export async function fetchTroubleWords(
  childId: number,
): Promise<TroubleWord[]> {
  const res = await fetch(`/api/teacher/children/${childId}/trouble-words`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load trouble words");
  return res.json();
}

// ── Teacher: Excuse attempt ───────────────────────────────────

export async function excuseAttempt(
  attemptId: number,
  childId: number,
): Promise<{ excused: boolean; newMasteryScore?: number }> {
  const res = await fetch("/api/teacher/excuse-attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ attemptId, childId }),
  });
  if (!res.ok) throw new Error("Failed to excuse attempt");
  return res.json();
}

// ── Teacher: Pronunciation override ───────────────────────────

// ── Child: Past mistakes (for proofreading) ─────────────────

export async function fetchPastMistakes(
  wordIds: number[],
): Promise<Record<number, string[]>> {
  if (wordIds.length === 0) return {};
  const res = await fetch(
    `/api/words/past-mistakes/${getUserId()}?wordIds=${wordIds.join(",")}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error("Failed to load past mistakes");
  return res.json();
}

export async function setPronunciationOverride(
  wordId: number,
  pronunciationOverride: string,
): Promise<{ wordId: number; pronunciationOverride: string | null }> {
  const res = await fetch(`/api/teacher/words/${wordId}/pronunciation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ pronunciationOverride }),
  });
  if (!res.ok) throw new Error("Failed to update pronunciation");
  return res.json();
}

// ── Student management ─────────────────────────────────────────

export async function createStudent(data: {
  firstName: string;
  lastName: string;
  gradeLevel: number;
  username: string;
  password: string;
}): Promise<any> {
  const res = await fetch("/api/teacher/students", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create student" }));
    throw new Error(err.error || "Failed to create student");
  }
  return res.json();
}

export async function updateStudent(
  studentId: number,
  data: {
    firstName: string;
    lastName: string;
    gradeLevel: number;
    username: string;
    password?: string;
  },
): Promise<any> {
  const res = await fetch(`/api/teacher/students/${studentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update student" }));
    throw new Error(err.error || "Failed to update student");
  }
  return res.json();
}

export async function deactivateStudent(studentId: number): Promise<any> {
  const res = await fetch(`/api/teacher/students/${studentId}/deactivate`, {
    method: "PUT",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to deactivate student");
  return res.json();
}

export async function activateStudent(studentId: number): Promise<any> {
  const res = await fetch(`/api/teacher/students/${studentId}/activate`, {
    method: "PUT",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to activate student");
  return res.json();
}

export async function deleteStudent(studentId: number): Promise<any> {
  const res = await fetch(`/api/teacher/students/${studentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete student");
  return res.json();
}

// ── Admin API ─────────────────────────────────────────────────

export async function loginAdmin(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch("/api/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function fetchTeachers(): Promise<TeacherSummary[]> {
  const res = await fetch("/api/admin/teachers", { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load teachers");
  return res.json();
}

export async function createTeacher(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<TeacherSummary & { familyId: number }> {
  const res = await fetch("/api/admin/teachers", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to create teacher");
  }
  return res.json();
}

export async function resetTeacherPassword(
  teacherId: number,
  password: string,
): Promise<{ id: number; reset: boolean }> {
  const res = await fetch(`/api/admin/teachers/${teacherId}/reset-password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to reset password");
  }
  return res.json();
}
