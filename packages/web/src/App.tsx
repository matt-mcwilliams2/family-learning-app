import { useCallback, useEffect, useRef, useState } from "react";
import { speak } from "./speech";
import { fetchWords, fetchStats, postAttempt, type WordFromApi, type Stats } from "./api";
import "./App.css";

type Phase = "ready" | "answered";

export function App() {
  const [words, setWords] = useState<WordFromApi[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [correct, setCorrect] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActive: null,
  });
  const [loading, setLoading] = useState(true);
  const [pointsFlash, setPointsFlash] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load words and stats on mount
  useEffect(() => {
    async function load() {
      try {
        const [w, s] = await Promise.all([fetchWords(), fetchStats()]);
        setWords(w);
        setStats(s);
      } catch (err) {
        console.error("Failed to load:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const currentWord = words[wordIndex] ?? null;

  // Focus input when word changes
  useEffect(() => {
    if (!currentWord) return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [currentWord]);

  const hearWord = useCallback(() => {
    if (!currentWord) return;
    const textToSpeak = currentWord.pronunciation_override ?? currentWord.word;
    speak(textToSpeak);
  }, [currentWord]);

  const checkAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect =
      input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");

    try {
      const result = await postAttempt({
        wordId: currentWord.id,
        correct: isCorrect,
        answerGiven: input.trim(),
      });
      // Refresh stats after recording
      const newStats = await fetchStats();
      setStats(newStats);
      if (result.pointsAwarded > 0) {
        setPointsFlash(result.pointsAwarded);
        setTimeout(() => setPointsFlash(null), 1200);
      }
    } catch (err) {
      console.error("Failed to record attempt:", err);
    }
  }, [input, currentWord]);

  const nextWord = useCallback(() => {
    setWordIndex((i) => (i + 1) % words.length);
    setInput("");
    setPhase("ready");
  }, [words.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "ready") {
          checkAnswer();
        } else {
          nextWord();
        }
      }
    },
    [phase, checkAnswer, nextWord],
  );

  if (loading) {
    return (
      <div className="app">
        <header className="header">
          <img src="/logo-square.png" alt="Family Spelling" className="logo" />
          <h1 className="title">Spelling</h1>
        </header>
        <p className="loading">Loading...</p>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="app">
        <header className="header">
          <img src="/logo-square.png" alt="Family Spelling" className="logo" />
          <h1 className="title">Spelling</h1>
        </header>
        <p className="loading">No words available.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <img src="/logo-square.png" alt="Family Spelling" className="logo" />
        <h1 className="title">Spelling</h1>
      </header>

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
        <p className="definition">{currentWord.definition}</p>

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
              Next word
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
