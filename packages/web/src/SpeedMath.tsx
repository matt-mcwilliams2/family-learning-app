import { useCallback, useEffect, useRef, useState } from "react";
import {
  postMathSession,
  fetchMathStats,
  type MathOperation,
  type MathStats,
} from "./api";
import "./App.css";

interface SpeedMathProps {
  onBack: () => void;
  onLogout: () => void;
}

type MathScreen = "home" | "duration" | "game" | "results";

interface MathProblem {
  a: number;
  b: number;
  answer: number;
  display: string;
}

// ── Problem pool generation ──

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generatePool(operation: MathOperation): MathProblem[] {
  const pairs: [number, number][] = [];

  // 1×1 through 13×13
  for (let a = 1; a <= 13; a++) {
    for (let b = 1; b <= 13; b++) {
      pairs.push([a, b]);
    }
  }

  // Extended multipliers × 1–10
  const extended = [15, 20, 25, 30, 50, 100, 200, 500, 1000, 2000];
  for (const m of extended) {
    for (let b = 1; b <= 10; b++) {
      pairs.push([m, b]);
    }
  }

  const problems: MathProblem[] = pairs.map(([a, b]) => {
    switch (operation) {
      case "multiplication":
        return { a, b, answer: a * b, display: `${a} \u00d7 ${b} =` };
      case "division": {
        const product = a * b;
        return { a: product, b: a, answer: b, display: `${product} \u00f7 ${a} =` };
      }
      case "addition":
        return { a, b, answer: a + b, display: `${a} + ${b} =` };
      case "subtraction": {
        const sum = a + b;
        return { a: sum, b: a, answer: b, display: `${sum} \u2212 ${a} =` };
      }
    }
  });

  return shuffle(problems);
}

const OP_LABELS: Record<MathOperation, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
};

const OP_SYMBOLS: Record<MathOperation, string> = {
  addition: "+",
  subtraction: "\u2212",
  multiplication: "\u00d7",
  division: "\u00f7",
};

const DURATION_OPTIONS = [1, 2, 3, 4, 5];

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SpeedMath({ onBack, onLogout }: SpeedMathProps) {
  const [screen, setScreen] = useState<MathScreen>("home");
  const [stats, setStats] = useState<MathStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Game config
  const [operation, setOperation] = useState<MathOperation>("multiplication");
  const [durationMins, setDurationMins] = useState(1);

  // Game state
  const [problems, setProblems] = useState<MathProblem[]>([]);
  const [problemIndex, setProblemIndex] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [wasCorrect, setWasCorrect] = useState(false);
  const [timer, setTimer] = useState(60);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [incorrectProblems, setIncorrectProblems] = useState<MathProblem[]>([]);
  const [poolExhausted, setPoolExhausted] = useState(false);

  // Results
  const [resultNewRecord, setResultNewRecord] = useState(false);
  const [resultBestTime, setResultBestTime] = useState<number | null>(null);
  const [resultAllCorrect, setResultAllCorrect] = useState(false);
  const [resultElapsed, setResultElapsed] = useState<number | null>(null);

  // Refs for timer/game
  const timerRef = useRef(60);
  const gameActiveRef = useRef(false);
  const startTimeRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const allCorrectSoFarRef = useRef(true);

  // Boot: load stats
  useEffect(() => {
    fetchMathStats()
      .then((s) => {
        setStats(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Focus input when problem changes
  useEffect(() => {
    if (screen === "game" && phase === "ready") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [screen, phase, problemIndex]);

  // Timer effect
  useEffect(() => {
    if (screen !== "game") return;
    const interval = setInterval(() => {
      timerRef.current -= 1;
      setTimer(timerRef.current);
      if (timerRef.current <= 0) {
        clearInterval(interval);
        gameActiveRef.current = false;
        setTimeout(() => finishGame(false), 50);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [screen]);

  // ── Start game ──
  const startGame = useCallback(
    (dur: number) => {
      setDurationMins(dur);
      const secs = dur * 60;
      const pool = generatePool(operation);
      setProblems(pool);
      setProblemIndex(0);
      setInput("");
      setPhase("ready");
      setTimer(secs);
      timerRef.current = secs;
      setCorrectCount(0);
      setTotalAttempted(0);
      setIncorrectProblems([]);
      setPoolExhausted(false);
      allCorrectSoFarRef.current = true;
      startTimeRef.current = Date.now();
      gameActiveRef.current = true;
      setScreen("game");
    },
    [operation],
  );

  // ── Finish game ──
  const finishGame = useCallback(
    async (allProblemsCleared: boolean) => {
      gameActiveRef.current = false;
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const allCorrect = allProblemsCleared && allCorrectSoFarRef.current;

      try {
        const result = await postMathSession({
          operation,
          durationSecs: durationMins * 60,
          totalProblems: totalAttempted,
          correctCount,
          allCorrect,
          elapsedSecs: allCorrect ? elapsed : undefined,
        });

        setResultNewRecord(result.newRecord);
        setResultBestTime(result.bestTime);
        setResultAllCorrect(allCorrect);
        setResultElapsed(allCorrect ? elapsed : null);

        // Refresh stats
        const newStats = await fetchMathStats();
        setStats(newStats);
      } catch (err) {
        console.error("Failed to record math session:", err);
      }

      setScreen("results");
    },
    [operation, durationMins, totalAttempted, correctCount],
  );

  // ── Check answer ──
  const checkAnswer = useCallback(() => {
    if (!input.trim() || !gameActiveRef.current) return;
    const currentProblem = problems[problemIndex];
    if (!currentProblem) return;

    const numAnswer = parseInt(input.trim(), 10);
    const isCorrect = numAnswer === currentProblem.answer;

    setWasCorrect(isCorrect);
    setPhase("answered");
    setTotalAttempted((p) => p + 1);

    if (isCorrect) {
      setCorrectCount((p) => p + 1);
    } else {
      allCorrectSoFarRef.current = false;
      setIncorrectProblems((prev) => [...prev, currentProblem]);
    }

    const delay = isCorrect ? 300 : 1200;
    setTimeout(() => {
      if (!gameActiveRef.current) return;

      const nextIdx = problemIndex + 1;

      if (nextIdx < problems.length) {
        // More problems in current pool
        setProblemIndex(nextIdx);
        setInput("");
        setPhase("ready");
      } else if (!poolExhausted) {
        // Pool exhausted — check for incorrect ones to re-ask
        // Gather up-to-date incorrects including current if wrong
        const updatedIncorrect = isCorrect
          ? [...incorrectProblems]
          : [...incorrectProblems, currentProblem];

        if (updatedIncorrect.length > 0) {
          const reshuffled = shuffle(updatedIncorrect);
          setProblems(reshuffled);
          setProblemIndex(0);
          setIncorrectProblems([]);
          setPoolExhausted(true);
          setInput("");
          setPhase("ready");
        } else {
          // All correct first time through
          finishGame(true);
        }
      } else {
        // We're in the retry pool
        // Gather remaining incorrects including current if wrong
        const updatedIncorrect = isCorrect
          ? [...incorrectProblems]
          : [...incorrectProblems, currentProblem];

        if (updatedIncorrect.length > 0) {
          const reshuffled = shuffle(updatedIncorrect);
          setProblems(reshuffled);
          setProblemIndex(0);
          setIncorrectProblems([]);
          setInput("");
          setPhase("ready");
        } else {
          // All retry problems now correct
          finishGame(true);
        }
      }
    }, delay);
  }, [input, problems, problemIndex, incorrectProblems, poolExhausted, finishGame]);

  // ── Keyboard ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && phase === "ready") {
        checkAnswer();
      }
    },
    [phase, checkAnswer],
  );

  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Speed Math" className="logo" />
      <h1 className="title">Speed Math</h1>
    </header>
  );

  // ────────────────────────────────────────
  // LOADING
  // ────────────────────────────────────────
  if (loading) {
    return (
      <div className="app">
        {header}
        <p className="loading">Loading...</p>
      </div>
    );
  }

  // ────────────────────────────────────────
  // HOME
  // ────────────────────────────────────────
  if (screen === "home") {
    return (
      <div className="app">
        {header}

        {stats && (
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
        )}

        <main className="card">
          <p className="mode-heading">Choose an operation</p>

          <button
            className="btn btn-math-add"
            onClick={() => {
              setOperation("addition");
              setScreen("duration");
            }}
            type="button"
          >
            + Addition
          </button>

          <button
            className="btn btn-math-sub"
            onClick={() => {
              setOperation("subtraction");
              setScreen("duration");
            }}
            type="button"
          >
            {"\u2212"} Subtraction
          </button>

          <button
            className="btn btn-math-mul"
            onClick={() => {
              setOperation("multiplication");
              setScreen("duration");
            }}
            type="button"
          >
            {"\u00d7"} Multiplication
          </button>

          <button
            className="btn btn-math-div"
            onClick={() => {
              setOperation("division");
              setScreen("duration");
            }}
            type="button"
          >
            {"\u00f7"} Division
          </button>
        </main>

        {/* Personal records */}
        {stats && stats.records && (
          <div className="math-records-section">
            <p className="badges-heading">Personal Records</p>
            <div className="math-records-grid">
              {(["addition", "subtraction", "multiplication", "division"] as const).map(
                (op) => (
                  <div key={op} className="math-record-row">
                    <span className="math-record-op">
                      {OP_SYMBOLS[op]} {OP_LABELS[op]}
                    </span>
                    <span className="math-record-time">
                      {stats.records[op]
                        ? formatTime(stats.records[op]!.bestTimeSecs)
                        : "\u2014"}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <div className="teacher-link-group">
          <button className="btn-link teacher-link" onClick={onBack} type="button">
            Back to apps
          </button>
          <button className="btn-link teacher-link" onClick={onLogout} type="button">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // DURATION PICKER
  // ────────────────────────────────────────
  if (screen === "duration") {
    return (
      <div className="app">
        {header}

        <main className="card">
          <p className="mode-heading">
            {OP_SYMBOLS[operation]} {OP_LABELS[operation]}
          </p>
          <p className="stage-label">How long?</p>

          <div className="math-duration-grid">
            {DURATION_OPTIONS.map((dur) => (
              <button
                key={dur}
                className="btn btn-duration"
                onClick={() => startGame(dur)}
                type="button"
              >
                {dur} min
              </button>
            ))}
          </div>

          <button
            className="btn-link"
            onClick={() => setScreen("home")}
            type="button"
          >
            Back
          </button>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // GAME
  // ────────────────────────────────────────
  if (screen === "game") {
    const currentProblem = problems[problemIndex];

    return (
      <div className="app">
        {header}

        <p className={`speed-timer ${timer <= 10 ? "speed-timer-low" : ""}`}>
          {formatTime(timer)}
        </p>

        <div className="speed-stats">
          <span>{correctCount} correct</span>
          <span>{totalAttempted} total</span>
        </div>

        {currentProblem && (
          <main className="card">
            <p className="math-problem">{currentProblem.display}</p>

            <input
              ref={inputRef}
              className="spelling-input"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="?"
              autoComplete="off"
              disabled={phase === "answered"}
            />

            {phase === "ready" && (
              <button
                className="btn btn-check"
                onClick={checkAnswer}
                disabled={!input.trim()}
                type="button"
              >
                Submit
              </button>
            )}

            {phase === "answered" && (
              <div
                className={`result ${wasCorrect ? "result-correct" : "result-wrong"}`}
              >
                <p className="result-text">
                  {wasCorrect ? "Correct!" : `${currentProblem.answer}`}
                </p>
              </div>
            )}
          </main>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────
  // RESULTS
  // ────────────────────────────────────────
  if (screen === "results") {
    const accuracy =
      totalAttempted > 0
        ? Math.round((correctCount / totalAttempted) * 100)
        : 0;

    return (
      <div className="app">
        {header}

        {resultNewRecord && (
          <div className="math-new-record">New Record!</div>
        )}

        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            {OP_LABELS[operation]} Complete
          </p>

          <div className="session-score">
            <span className="score-big">{correctCount}</span>
            <span className="score-detail">
              out of {totalAttempted} correct ({accuracy}%)
            </span>
          </div>

          {resultAllCorrect && resultElapsed !== null && (
            <div className="math-elapsed">
              Time: {formatTime(resultElapsed)}
            </div>
          )}

          {resultBestTime !== null && (
            <div className="math-best-time">
              Best time: {formatTime(resultBestTime)}
            </div>
          )}

          <button
            className="btn btn-check"
            onClick={() => {
              fetchMathStats()
                .then(setStats)
                .catch(console.error);
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
