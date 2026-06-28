import { useCallback, useEffect, useRef, useState } from "react";
import { speak } from "./speech";
import {
  fetchPlacementStatus,
  fetchPlacementQuiz,
  scorePlacement,
  fetchSessionWords,
  fetchStats,
  postAttempt,
  postSession,
  type WordFromApi,
  type Stats,
  type PlacementScoreResult,
  type SessionResult,
} from "./api";
import { PickSpelling } from "./PickSpelling";
import { MatchExercise } from "./MatchExercise";
import "./App.css";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
type Screen =
  | "loading"
  | "placement"
  | "placement-results"
  | "home"
  | "session"
  | "session-results";

type SessionMode = "learn" | "practice" | "test";

type SessionStage =
  | "match"
  | "pick_spelling"
  | "hear_and_spell"
  | "out_of_lives";

interface WordResult {
  word: WordFromApi;
  correct: boolean;
  answerGiven: string;
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────
const LIVES_PRACTICE = 5;
const LIVES_TEST = 3;
const RECOVERY_LIVES = 2;
const TEST_MAX_REPLAYS = 1;

export function App() {
  // ── Screen state ──
  const [screen, setScreen] = useState<Screen>("loading");
  const [stats, setStats] = useState<Stats>({
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActive: null,
  });
  const [currentLevel, setCurrentLevel] = useState(6.0);

  // ── Placement ──
  const [placementWords, setPlacementWords] = useState<WordFromApi[]>([]);
  const [placementResults, setPlacementResults] =
    useState<PlacementScoreResult | null>(null);

  // ── Session ──
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [sessionStage, setSessionStage] = useState<SessionStage>("hear_and_spell");
  const [sessionWords, setSessionWords] = useState<WordFromApi[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [correct, setCorrect] = useState(false);
  const [pointsFlash, setPointsFlash] = useState<number | null>(null);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  // Learn mode
  const [learnRetestQueue, setLearnRetestQueue] = useState<WordFromApi[]>([]);
  const [inRetest, setInRetest] = useState(false);

  // Practice mode
  const [practiceMissedQueue, setPracticeMissedQueue] = useState<WordFromApi[]>([]);

  // Test mode replay limit
  const [testReplaysUsed, setTestReplaysUsed] = useState(0);

  // Lives
  const [lives, setLives] = useState(LIVES_PRACTICE);
  const [livesMax, setLivesMax] = useState(LIVES_PRACTICE);
  const [livesRecovered, setLivesRecovered] = useState(false);

  // Pick spelling stage index
  const [pickSpellingIndex, setPickSpellingIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Bootstrap ──
  useEffect(() => {
    async function boot() {
      try {
        const [placement, s] = await Promise.all([
          fetchPlacementStatus(),
          fetchStats(),
        ]);
        setStats(s);
        setCurrentLevel(placement.currentLevel);

        if (!placement.taken) {
          const quiz = await fetchPlacementQuiz();
          setPlacementWords(quiz.words);
          setWordIndex(0);
          setWordResults([]);
          setInput("");
          setPhase("ready");
          setScreen("placement");
        } else {
          setScreen("home");
        }
      } catch (err) {
        console.error("Boot failed:", err);
        setScreen("home");
      }
    }
    boot();
  }, []);

  // Current word for placement or hear_and_spell/pick_spelling stages
  const currentWord =
    screen === "placement"
      ? placementWords[wordIndex] ?? null
      : sessionStage === "pick_spelling"
        ? sessionWords[pickSpellingIndex] ?? null
        : sessionWords[wordIndex] ?? null;

  // Focus input when word changes (hear_and_spell / placement)
  useEffect(() => {
    if (!currentWord) return;
    if (sessionStage !== "hear_and_spell" && screen !== "placement") return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [currentWord, wordIndex, sessionStage, screen]);

  // ── Shared helpers ──
  const hearWord = useCallback(() => {
    if (!currentWord) return;
    if (screen === "session" && sessionMode === "test") {
      if (testReplaysUsed >= TEST_MAX_REPLAYS && phase === "ready") return;
      if (phase === "ready") setTestReplaysUsed((n) => n + 1);
    }
    const text =
      currentWord.pronunciationOverride ??
      currentWord.pronunciation_override ??
      currentWord.word;
    speak(text);
  }, [currentWord, screen, sessionMode, testReplaysUsed, phase]);

  // ── Start a session ──
  const startSession = useCallback(async (mode: SessionMode) => {
    try {
      const data = await fetchSessionWords(mode, 10);
      setSessionMode(mode);
      setSessionWords(data.words);
      setCurrentLevel(data.currentLevel);
      setWordIndex(0);
      setInput("");
      setPhase("ready");
      setWordResults([]);
      setLearnRetestQueue([]);
      setInRetest(false);
      setPracticeMissedQueue([]);
      setTestReplaysUsed(0);
      setPickSpellingIndex(0);
      setSessionResult(null);

      // Set lives and initial stage based on mode
      if (mode === "learn") {
        setLives(Infinity);
        setLivesMax(0); // no hearts display
        setSessionStage(data.words.length > 0 ? "match" : "hear_and_spell");
      } else if (mode === "practice") {
        setLives(LIVES_PRACTICE);
        setLivesMax(LIVES_PRACTICE);
        setSessionStage(data.words.length > 0 ? "match" : "hear_and_spell");
      } else {
        setLives(LIVES_TEST);
        setLivesMax(LIVES_TEST);
        setSessionStage("hear_and_spell");
      }
      setLivesRecovered(false);
      setScreen("session");
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }, []);

  // ── Match exercise complete ──
  const handleMatchComplete = useCallback(() => {
    if (sessionMode === "learn") {
      setSessionStage("pick_spelling");
      setPickSpellingIndex(0);
    } else {
      setSessionStage("hear_and_spell");
      setWordIndex(0);
      setInput("");
      setPhase("ready");
    }
  }, [sessionMode]);

  // ── Pick spelling complete for one word ──
  const handlePickComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const pickWord = sessionWords[pickSpellingIndex];
      if (!pickWord) return;

      try {
        await postAttempt({
          wordId: pickWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "pick_correct_spelling",
          mode: "learn",
        });
        const newStats = await fetchStats();
        setStats(newStats);
      } catch (err) {
        console.error("Failed to record pick attempt:", err);
      }

      const nextIdx = pickSpellingIndex + 1;
      if (nextIdx < sessionWords.length) {
        setPickSpellingIndex(nextIdx);
      } else {
        // All pick-spelling done, move to hear_and_spell
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
      }
    },
    [pickSpellingIndex, sessionWords],
  );

  // ── Placement quiz ──
  const handlePlacementAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");
    setWordResults((prev) => [
      ...prev,
      { word: currentWord, correct: isCorrect, answerGiven: input.trim() },
    ]);
  }, [input, currentWord]);

  const nextPlacementWord = useCallback(async () => {
    const nextIdx = wordIndex + 1;
    if (nextIdx < placementWords.length) {
      setWordIndex(nextIdx);
      setInput("");
      setPhase("ready");
    } else {
      try {
        const results = wordResults.map((r) => ({
          wordId: r.word.id,
          grade: r.word.grade,
          correct: r.correct,
        }));
        const lastWord = placementWords[wordIndex];
        if (lastWord && !results.find((r) => r.wordId === lastWord.id)) {
          results.push({
            wordId: lastWord.id,
            grade: lastWord.grade,
            correct: correct,
          });
        }
        const scoreResult = await scorePlacement(results);
        setPlacementResults(scoreResult);
        setCurrentLevel(scoreResult.placementLevel);
        setScreen("placement-results");
      } catch (err) {
        console.error("Failed to score placement:", err);
      }
    }
  }, [wordIndex, placementWords, wordResults, correct]);

  // ── Session: check answer (hear_and_spell) ──
  const checkAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");

    // Learn mode: queue missed for retest
    if (sessionMode === "learn" && !isCorrect && !inRetest) {
      setLearnRetestQueue((prev) => {
        if (prev.find((w) => w.id === currentWord.id)) return prev;
        return [...prev, currentWord];
      });
    }

    // Practice mode: queue missed to cycle back
    if (sessionMode === "practice" && !isCorrect) {
      setPracticeMissedQueue((prev) => {
        if (prev.find((w) => w.id === currentWord.id)) return prev;
        return [...prev, currentWord];
      });
    }

    // Deduct a life on wrong answer in Practice/Test
    if (!isCorrect && sessionMode !== "learn") {
      setLives((prev) => prev - 1);
    }

    // Record attempt
    try {
      const result = await postAttempt({
        wordId: currentWord.id,
        correct: isCorrect,
        answerGiven: input.trim(),
        exerciseType: "hear_and_spell",
        mode: sessionMode,
      });
      const newStats = await fetchStats();
      setStats(newStats);
      if (result.pointsAwarded > 0) {
        setPointsFlash(result.pointsAwarded);
        setTimeout(() => setPointsFlash(null), 1200);
      }
    } catch (err) {
      console.error("Failed to record attempt:", err);
    }

    // Track result (only hear_and_spell feeds session scoring)
    setWordResults((prev) => [
      ...prev,
      { word: currentWord, correct: isCorrect, answerGiven: input.trim() },
    ]);
  }, [input, currentWord, sessionMode, inRetest]);

  // ── Finish session helper ──
  const finishSession = useCallback(async () => {
    try {
      const totalWords = wordResults.length;
      const correctCount = wordResults.filter((r) => r.correct).length;
      if (totalWords > 0) {
        const result = await postSession({
          mode: sessionMode,
          totalWords,
          correctCount,
        });
        setSessionResult(result);
        setCurrentLevel(result.levelAfter);
      }
    } catch (err) {
      console.error("Failed to record session:", err);
    }
    setScreen("session-results");
  }, [wordResults, sessionMode]);

  // ── Next word (hear_and_spell) ──
  const nextWord = useCallback(async () => {
    // Learn mode: wrong answer = try again
    if (sessionMode === "learn" && !correct && phase === "answered") {
      setInput("");
      setPhase("ready");
      return;
    }

    // Check for out-of-lives before advancing
    if (lives <= 0 && sessionMode !== "learn") {
      // Record session so far
      try {
        const totalWords = wordResults.length;
        const correctCount = wordResults.filter((r) => r.correct).length;
        if (totalWords > 0) {
          const result = await postSession({
            mode: sessionMode,
            totalWords,
            correctCount,
          });
          setSessionResult(result);
          setCurrentLevel(result.levelAfter);
        }
      } catch (err) {
        console.error("Failed to record session:", err);
      }
      setSessionStage("out_of_lives");
      return;
    }

    const nextIdx = wordIndex + 1;

    if (nextIdx < sessionWords.length) {
      setWordIndex(nextIdx);
      setInput("");
      setPhase("ready");
      setTestReplaysUsed(0);
    } else {
      // End of word list

      // Learn mode: retest missed
      if (sessionMode === "learn" && !inRetest && learnRetestQueue.length > 0) {
        setSessionWords(learnRetestQueue);
        setLearnRetestQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        setInRetest(true);
        return;
      }

      // Practice mode: cycle missed words
      if (sessionMode === "practice" && practiceMissedQueue.length > 0) {
        setSessionWords(practiceMissedQueue);
        setPracticeMissedQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return;
      }

      // Session complete
      await finishSession();
    }
  }, [
    wordIndex,
    sessionWords,
    sessionMode,
    correct,
    phase,
    inRetest,
    learnRetestQueue,
    practiceMissedQueue,
    lives,
    wordResults,
    finishSession,
  ]);

  // ── Recovery from out-of-lives ──
  const handleRecovery = useCallback(() => {
    setLives(RECOVERY_LIVES);
    setLivesRecovered(true);
    setSessionStage("hear_and_spell");
    setInput("");
    setPhase("ready");
  }, []);

  // ── Keyboard handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "ready") {
          if (screen === "placement") handlePlacementAnswer();
          else checkAnswer();
        } else {
          if (screen === "placement") nextPlacementWord();
          else nextWord();
        }
      }
    },
    [phase, screen, handlePlacementAnswer, checkAnswer, nextPlacementWord, nextWord],
  );

  // ── Shared header ──
  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Spelling</h1>
    </header>
  );

  // ── Hearts display ──
  const heartsDisplay =
    sessionMode !== "learn" && livesMax > 0 ? (
      <div className="hearts">
        {Array.from({ length: livesMax }).map((_, i) => (
          <span
            key={i}
            className={`heart ${i < lives ? "heart-full" : "heart-empty"}`}
          >
            &#9829;
          </span>
        ))}
      </div>
    ) : null;

  // ────────────────────────────────────────
  // LOADING
  // ────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="app">
        {header}
        <p className="loading">Loading...</p>
      </div>
    );
  }

  // ────────────────────────────────────────
  // PLACEMENT QUIZ
  // ────────────────────────────────────────
  if (screen === "placement") {
    const progress = placementWords.length
      ? `${wordIndex + 1} / ${placementWords.length}`
      : "";

    return (
      <div className="app">
        {header}
        <div className="placement-banner">
          <p className="placement-title">Placement Quiz</p>
          <p className="placement-sub">
            Let's find your starting level. One chance per word.
          </p>
        </div>

        <main className="card">
          <p className="word-progress">{progress}</p>

          {currentWord && (
            <>
              <button className="btn btn-hear" onClick={hearWord} type="button">
                <span className="btn-icon">&#x1f50a;</span> Hear the word
              </button>

              <input
                ref={inputRef}
                className="spelling-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type the spelling..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={phase === "answered"}
                data-gramm="false"
              />

              {phase === "ready" && (
                <button
                  className="btn btn-check"
                  onClick={handlePlacementAnswer}
                  disabled={!input.trim()}
                  type="button"
                >
                  Check
                </button>
              )}

              {phase === "answered" && (
                <div
                  className={`result ${correct ? "result-correct" : "result-wrong"}`}
                >
                  <p className="result-text">
                    {correct ? "Correct!" : "Not quite."}
                  </p>
                  {!correct && (
                    <p className="result-answer">
                      The answer is: <strong>{currentWord.word}</strong>
                    </p>
                  )}
                  <button
                    className="btn btn-next"
                    onClick={nextPlacementWord}
                    type="button"
                  >
                    {wordIndex + 1 < placementWords.length
                      ? "Next word"
                      : "See results"}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // PLACEMENT RESULTS
  // ────────────────────────────────────────
  if (screen === "placement-results" && placementResults) {
    return (
      <div className="app">
        {header}
        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            Placement Complete
          </p>
          <p className="placement-level-result">
            Your starting level:{" "}
            <strong>{placementResults.placementLevel}</strong>
          </p>
          <p className="placement-accuracy">
            {placementResults.totalCorrect} / {placementResults.totalWords}{" "}
            correct ({placementResults.overallAccuracy}%)
          </p>

          <div className="band-scores">
            {placementResults.bandScores.map((band) => (
              <div key={band.grade} className="band-row">
                <span className="band-label">Grade {band.grade}</span>
                <span className="band-value">
                  {band.correct}/{band.total} ({band.accuracy}%)
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn btn-check"
            onClick={() => setScreen("home")}
            type="button"
          >
            Start practicing
          </button>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // HOME / MODE PICKER
  // ────────────────────────────────────────
  if (screen === "home") {
    return (
      <div className="app">
        {header}

        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.totalPoints}</span>
            <span className="stat-label">XP</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.currentStreak}</span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{currentLevel}</span>
            <span className="stat-label">level</span>
          </div>
        </div>

        <main className="card">
          <p className="mode-heading">Choose a mode</p>

          <button
            className="btn btn-learn"
            onClick={() => startSession("learn")}
            type="button"
          >
            Learn new words
          </button>
          <p className="mode-desc">
            Meet new words with definitions and audio. No penalty for mistakes.
          </p>

          <button
            className="btn btn-practice"
            onClick={() => startSession("practice")}
            type="button"
          >
            Practice
          </button>
          <p className="mode-desc">
            Review words you've learned. Wrong answers cost points and lives.
          </p>

          <button
            className="btn btn-test"
            onClick={() => startSession("test")}
            type="button"
          >
            Test
          </button>
          <p className="mode-desc">
            Graded quiz. One chance per word, limited replays.
          </p>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // SESSION
  // ────────────────────────────────────────
  if (screen === "session") {
    const modeBadge =
      sessionMode === "learn"
        ? "Learn"
        : sessionMode === "practice"
          ? "Practice"
          : "Test";

    // ── MATCH STAGE ──
    if (sessionStage === "match") {
      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="stage-label">Match words to definitions</span>
            </div>
            <MatchExercise
              words={sessionWords}
              mode={sessionMode as "learn" | "practice"}
              onComplete={handleMatchComplete}
              onStatsUpdate={setStats}
            />
          </main>
        </div>
      );
    }

    // ── PICK SPELLING STAGE ──
    if (sessionStage === "pick_spelling") {
      const pickWord = sessionWords[pickSpellingIndex];
      if (!pickWord) {
        // Shouldn't happen, but gracefully advance
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {pickSpellingIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Pick the correct spelling</p>
            <PickSpelling
              word={pickWord}
              onComplete={handlePickComplete}
            />
          </main>
        </div>
      );
    }

    // ── OUT OF LIVES ──
    if (sessionStage === "out_of_lives") {
      const totalWords = wordResults.length;
      const correctCount = wordResults.filter((r) => r.correct).length;

      return (
        <div className="app">
          {header}
          <main className="card">
            <p className="out-of-lives-heading">Out of lives!</p>
            <div className="session-score">
              <span className="score-detail">
                {correctCount} / {totalWords} correct so far
              </span>
            </div>
            {!livesRecovered && (
              <button
                className="btn btn-learn"
                onClick={handleRecovery}
                type="button"
              >
                Continue (+{RECOVERY_LIVES} lives)
              </button>
            )}
            <button
              className="btn btn-next"
              onClick={() => setScreen("session-results")}
              type="button"
            >
              End session
            </button>
          </main>
        </div>
      );
    }

    // ── HEAR AND SPELL STAGE ──
    if (!currentWord) {
      return (
        <div className="app">
          {header}
          <p className="loading">No words available for this session.</p>
          <button
            className="btn btn-check"
            style={{ maxWidth: 400, marginTop: 16 }}
            onClick={() => setScreen("home")}
            type="button"
          >
            Back to home
          </button>
        </div>
      );
    }

    const progress = `${wordIndex + 1} / ${sessionWords.length}`;
    const showDefinition = sessionMode !== "test";
    const canReplay =
      sessionMode !== "test" ||
      testReplaysUsed < TEST_MAX_REPLAYS ||
      phase === "answered";

    return (
      <div className="app">
        {header}

        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.totalPoints}</span>
            <span className="stat-label">XP</span>
            {pointsFlash !== null && (
              <span className="points-flash">+{pointsFlash}</span>
            )}
          </div>
          <div className="stat">
            <span className="stat-value">{stats.currentStreak}</span>
            <span className="stat-label">day streak</span>
          </div>
          {heartsDisplay}
        </div>

        <main className="card">
          <div className="session-header">
            <span className={`mode-badge mode-${sessionMode}`}>
              {modeBadge}
            </span>
            <span className="word-progress">{progress}</span>
            {inRetest && <span className="retest-badge">Retest</span>}
          </div>

          {showDefinition && (
            <p className="definition">{currentWord.definition}</p>
          )}

          <button
            className="btn btn-hear"
            onClick={hearWord}
            type="button"
            disabled={!canReplay}
          >
            <span className="btn-icon">&#x1f50a;</span>
            {sessionMode === "test" && phase === "ready"
              ? `Hear the word (${TEST_MAX_REPLAYS - testReplaysUsed} left)`
              : "Hear the word"}
          </button>

          <input
            ref={inputRef}
            className="spelling-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type the spelling..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={phase === "answered"}
            data-gramm="false"
          />

          {phase === "ready" && (
            <button
              className="btn btn-check"
              onClick={checkAnswer}
              disabled={!input.trim()}
              type="button"
            >
              Check
            </button>
          )}

          {phase === "answered" && (
            <div
              className={`result ${correct ? "result-correct" : "result-wrong"}`}
            >
              <p className="result-text">
                {correct ? "Correct!" : "Not quite."}
              </p>
              {!correct && (
                <p className="result-answer">
                  The answer is: <strong>{currentWord.word}</strong>
                </p>
              )}
              <button className="btn btn-next" onClick={nextWord} type="button">
                {sessionMode === "learn" && !correct
                  ? "Try again"
                  : wordIndex + 1 < sessionWords.length
                    ? "Next word"
                    : sessionMode === "learn" && learnRetestQueue.length > 0
                      ? "Start retest"
                      : sessionMode === "practice" &&
                          practiceMissedQueue.length > 0
                        ? "Review missed words"
                        : "Finish"}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // SESSION RESULTS
  // ────────────────────────────────────────
  if (screen === "session-results") {
    const totalWords = wordResults.length;
    const correctCount = wordResults.filter((r) => r.correct).length;
    const accuracy =
      totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
    const missed = wordResults.filter((r) => !r.correct);

    return (
      <div className="app">
        {header}

        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            {sessionMode === "test"
              ? "Test"
              : sessionMode === "learn"
                ? "Learn"
                : "Practice"}{" "}
            Complete
          </p>

          <div className="session-score">
            <span className="score-big">{accuracy}%</span>
            <span className="score-detail">
              {correctCount} / {totalWords} correct
            </span>
          </div>

          {sessionResult && sessionResult.levelDirection !== "hold" && (
            <p
              className={`level-change level-${sessionResult.levelDirection}`}
            >
              Level {sessionResult.levelDirection === "up" ? "up" : "down"}:{" "}
              {sessionResult.levelBefore} → {sessionResult.levelAfter}
            </p>
          )}

          {missed.length > 0 && (
            <div className="missed-words">
              <p className="missed-heading">Words to review:</p>
              {missed.map((r, i) => (
                <div key={i} className="missed-row">
                  <span className="missed-word">{r.word.word}</span>
                  <span className="missed-typed">{r.answerGiven}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-check"
            onClick={() => {
              fetchStats().then(setStats).catch(console.error);
              setScreen("home");
            }}
            type="button"
          >
            Back to home
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {header}
      <p className="loading">Something went wrong.</p>
    </div>
  );
}
