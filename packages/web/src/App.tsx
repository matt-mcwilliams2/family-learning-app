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
import "./App.css";

// ────────────────────────────────────────────────
// Top-level screen state machine
// ────────────────────────────────────────────────
type Screen =
  | "loading"
  | "placement"
  | "placement-results"
  | "home"
  | "session"
  | "session-results";

type SessionMode = "learn" | "practice" | "test";

// Per-word result tracked during a session
interface WordResult {
  word: WordFromApi;
  correct: boolean;
  answerGiven: string;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [stats, setStats] = useState<Stats>({
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActive: null,
  });
  const [currentLevel, setCurrentLevel] = useState(6.0);

  // Placement state
  const [placementWords, setPlacementWords] = useState<WordFromApi[]>([]);
  const [placementResults, setPlacementResults] =
    useState<PlacementScoreResult | null>(null);

  // Session state
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [sessionWords, setSessionWords] = useState<WordFromApi[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [correct, setCorrect] = useState(false);
  const [pointsFlash, setPointsFlash] = useState<number | null>(null);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  // Learn mode: words missed on first try, to retest at end
  const [learnRetestQueue, setLearnRetestQueue] = useState<WordFromApi[]>([]);
  const [inRetest, setInRetest] = useState(false);

  // Practice mode: words missed, to cycle back
  const [practiceMissedQueue, setPracticeMissedQueue] = useState<WordFromApi[]>([]);

  // Test mode: replay count
  const [testReplaysUsed, setTestReplaysUsed] = useState(0);
  const TEST_MAX_REPLAYS = 1;

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
          // Need placement test
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
        // Fall back to home screen
        setScreen("home");
      }
    }
    boot();
  }, []);

  // Focus input when word changes
  const currentWord =
    screen === "placement"
      ? placementWords[wordIndex] ?? null
      : sessionWords[wordIndex] ?? null;

  useEffect(() => {
    if (!currentWord) return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [currentWord, wordIndex]);

  // ── Shared helpers ──
  const hearWord = useCallback(() => {
    if (!currentWord) return;
    // In test mode, limit replays
    if (screen === "session" && sessionMode === "test") {
      if (testReplaysUsed >= TEST_MAX_REPLAYS && phase === "ready") {
        return; // exhausted replays
      }
      if (phase === "ready") {
        setTestReplaysUsed((n) => n + 1);
      }
    }
    const text = currentWord.pronunciationOverride ?? currentWord.pronunciation_override ?? currentWord.word;
    speak(text);
  }, [currentWord, screen, sessionMode, testReplaysUsed, phase]);

  // ── Placement quiz logic ──
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
      // Quiz complete — score it
      try {
        const results = wordResults.map((r) => ({
          wordId: r.word.id,
          grade: r.word.grade,
          correct: r.correct,
        }));
        // Include the last answer we just recorded
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

  // ── Start a session ──
  const startSession = useCallback(
    async (mode: SessionMode) => {
      try {
        const limit = mode === "test" ? 10 : 10;
        const data = await fetchSessionWords(mode, limit);
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
        setScreen("session");
      } catch (err) {
        console.error("Failed to start session:", err);
      }
    },
    [],
  );

  // ── Session answer logic ──
  const checkAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");

    // In learn mode, wrong answers are no-penalty — just mark for retest
    if (sessionMode === "learn" && !isCorrect) {
      if (!inRetest) {
        setLearnRetestQueue((prev) => {
          if (prev.find((w) => w.id === currentWord.id)) return prev;
          return [...prev, currentWord];
        });
      }
    }

    // In practice mode, missed words cycle back
    if (sessionMode === "practice" && !isCorrect) {
      setPracticeMissedQueue((prev) => {
        if (prev.find((w) => w.id === currentWord.id)) return prev;
        return [...prev, currentWord];
      });
    }

    // Record the attempt (except in learn mode retries — still record)
    try {
      const result = await postAttempt({
        wordId: currentWord.id,
        correct: isCorrect,
        answerGiven: input.trim(),
        exerciseType: "hear_and_spell",
        mode: sessionMode,
      });

      // Update stats
      const newStats = await fetchStats();
      setStats(newStats);

      if (result.pointsAwarded > 0) {
        setPointsFlash(result.pointsAwarded);
        setTimeout(() => setPointsFlash(null), 1200);
      }
    } catch (err) {
      console.error("Failed to record attempt:", err);
    }

    // Track result
    setWordResults((prev) => [
      ...prev,
      { word: currentWord, correct: isCorrect, answerGiven: input.trim() },
    ]);
  }, [input, currentWord, sessionMode, inRetest]);

  const nextWord = useCallback(async () => {
    // In learn mode, wrong answer = try again (don't advance)
    if (sessionMode === "learn" && !correct && phase === "answered") {
      setInput("");
      setPhase("ready");
      return;
    }

    const nextIdx = wordIndex + 1;
    const wordsArray = sessionWords;

    if (nextIdx < wordsArray.length) {
      setWordIndex(nextIdx);
      setInput("");
      setPhase("ready");
      setTestReplaysUsed(0);
    } else {
      // End of word list

      // Learn mode: check if there are missed words to retest
      if (sessionMode === "learn" && !inRetest && learnRetestQueue.length > 0) {
        setSessionWords(learnRetestQueue);
        setLearnRetestQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        setInRetest(true);
        return;
      }

      // Practice mode: cycle missed words back
      if (sessionMode === "practice" && practiceMissedQueue.length > 0) {
        setSessionWords(practiceMissedQueue);
        setPracticeMissedQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return;
      }

      // Session complete — record it
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
    wordResults,
  ]);

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

  // ── Header (shared) ──
  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Spelling</h1>
    </header>
  );

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
                <div className={`result ${correct ? "result-correct" : "result-wrong"}`}>
                  <p className="result-text">
                    {correct ? "Correct!" : "Not quite."}
                  </p>
                  {!correct && (
                    <p className="result-answer">
                      The answer is: <strong>{currentWord.word}</strong>
                    </p>
                  )}
                  <button className="btn btn-next" onClick={nextPlacementWord} type="button">
                    {wordIndex + 1 < placementWords.length ? "Next word" : "See results"}
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
            Your starting level: <strong>{placementResults.placementLevel}</strong>
          </p>
          <p className="placement-accuracy">
            {placementResults.totalCorrect} / {placementResults.totalWords} correct (
            {placementResults.overallAccuracy}%)
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
            Review words you've learned. Wrong answers cost points.
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
  // SESSION (Learn / Practice / Test)
  // ────────────────────────────────────────
  if (screen === "session") {
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
    const modeBadge =
      sessionMode === "learn"
        ? "Learn"
        : sessionMode === "practice"
          ? "Practice"
          : "Test";

    const showDefinition = sessionMode !== "test";
    const canReplay =
      sessionMode !== "test" || testReplaysUsed < TEST_MAX_REPLAYS || phase === "answered";

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
        </div>

        <main className="card">
          <div className="session-header">
            <span className={`mode-badge mode-${sessionMode}`}>{modeBadge}</span>
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
            <div className={`result ${correct ? "result-correct" : "result-wrong"}`}>
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
                      : sessionMode === "practice" && practiceMissedQueue.length > 0
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
    const accuracy = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
    const missed = wordResults.filter((r) => !r.correct);

    return (
      <div className="app">
        {header}

        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            {sessionMode === "test" ? "Test" : sessionMode === "learn" ? "Learn" : "Practice"} Complete
          </p>

          <div className="session-score">
            <span className="score-big">{accuracy}%</span>
            <span className="score-detail">
              {correctCount} / {totalWords} correct
            </span>
          </div>

          {sessionResult && sessionResult.levelDirection !== "hold" && (
            <p className={`level-change level-${sessionResult.levelDirection}`}>
              Level {sessionResult.levelDirection === "up" ? "up" : "down"}: {sessionResult.levelBefore} → {sessionResult.levelAfter}
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

  // Fallback
  return (
    <div className="app">
      {header}
      <p className="loading">Something went wrong.</p>
    </div>
  );
}
