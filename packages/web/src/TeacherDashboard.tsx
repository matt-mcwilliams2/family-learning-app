import { useCallback, useEffect, useState } from "react";
import {
  fetchChildren,
  fetchChildWords,
  fetchChildTests,
  setWeeklyWords,
  addChildWord,
  deleteChildWord,
  assignTest,
  fetchAssignedTests,
  triggerPlacement,
  fetchTroubleWords,
  excuseAttempt,
  setPronunciationOverride,
  type ChildSummary,
  type WordStatus,
  type TestResult,
  type AssignedTest,
  type TroubleWord,
} from "./api";

interface TeacherDashboardProps {
  onLogout: () => void;
}

type Tab = "overview" | "words" | "tests";

export function TeacherDashboard({ onLogout }: TeacherDashboardProps) {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildSummary | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [words, setWords] = useState<WordStatus[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [weeklyCount, setWeeklyCount] = useState(10);
  const [weeklyEditing, setWeeklyEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add word state
  const [addWordInput, setAddWordInput] = useState("");
  const [addWordGrade, setAddWordGrade] = useState(6);
  const [addWordLoading, setAddWordLoading] = useState(false);
  const [addWordMsg, setAddWordMsg] = useState<string | null>(null);

  // Assign test state
  const [assignTestCount, setAssignTestCount] = useState(10);
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  // Placement state
  const [placementGrade, setPlacementGrade] = useState(6);
  const [placementLoading, setPlacementLoading] = useState(false);
  const [placementMsg, setPlacementMsg] = useState<string | null>(null);

  // Trouble words state
  const [troubleWords, setTroubleWords] = useState<TroubleWord[]>([]);

  // Override state (per-attempt excuse, per-word pronunciation)
  const [excusingId, setExcusingId] = useState<number | null>(null);
  const [pronEditWordId, setPronEditWordId] = useState<number | null>(null);
  const [pronInput, setPronInput] = useState("");

  useEffect(() => {
    fetchChildren()
      .then((c) => {
        setChildren(c);
        if (c.length > 0) {
          setSelectedChild(c[0]);
          setWeeklyCount(c[0].weeklyNewWords);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load tab data when child or tab changes
  useEffect(() => {
    if (!selectedChild) return;

    if (tab === "overview") {
      fetchTroubleWords(selectedChild.id)
        .then(setTroubleWords)
        .catch(console.error);
    } else if (tab === "words") {
      fetchChildWords(selectedChild.id)
        .then(setWords)
        .catch(console.error);
    } else if (tab === "tests") {
      fetchChildTests(selectedChild.id)
        .then(setTests)
        .catch(console.error);
      fetchAssignedTests(selectedChild.id)
        .then(setAssignedTests)
        .catch(console.error);
    }
  }, [selectedChild, tab]);

  const handleChildChange = useCallback(
    (id: number) => {
      const child = children.find((c) => c.id === id);
      if (child) {
        setSelectedChild(child);
        setWeeklyCount(child.weeklyNewWords);
        setWeeklyEditing(false);
        setExpandedTest(null);
        setAddWordMsg(null);
        setAssignMsg(null);
        setPlacementMsg(null);
      }
    },
    [children],
  );

  const handleWeeklySave = useCallback(async () => {
    if (!selectedChild) return;
    try {
      await setWeeklyWords(selectedChild.id, weeklyCount);
      setSelectedChild({ ...selectedChild, weeklyNewWords: weeklyCount });
      setChildren((prev) =>
        prev.map((c) =>
          c.id === selectedChild.id ? { ...c, weeklyNewWords: weeklyCount } : c,
        ),
      );
      setWeeklyEditing(false);
    } catch (err) {
      console.error("Failed to save weekly words:", err);
    }
  }, [selectedChild, weeklyCount]);

  // ── Add word handler ──
  const handleAddWord = useCallback(async () => {
    if (!selectedChild || !addWordInput.trim()) return;
    setAddWordLoading(true);
    setAddWordMsg(null);
    try {
      const result = await addChildWord(
        selectedChild.id,
        addWordInput.trim(),
        addWordGrade,
      );
      if (result.restored) {
        setAddWordMsg("Word restored to rotation.");
      } else {
        setAddWordMsg(`Added "${result.word}" with auto-filled details.`);
      }
      setAddWordInput("");
      // Refresh word list
      const updated = await fetchChildWords(selectedChild.id);
      setWords(updated);
    } catch (err) {
      console.error("Failed to add word:", err);
      setAddWordMsg("Failed to add word.");
    } finally {
      setAddWordLoading(false);
    }
  }, [selectedChild, addWordInput, addWordGrade]);

  // ── Delete word handler ──
  const handleDeleteWord = useCallback(
    async (wordId: number) => {
      if (!selectedChild) return;
      try {
        await deleteChildWord(selectedChild.id, wordId);
        setWords((prev) => prev.filter((w) => w.id !== wordId));
      } catch (err) {
        console.error("Failed to remove word:", err);
      }
    },
    [selectedChild],
  );

  // ── Assign test handler ──
  const handleAssignTest = useCallback(async () => {
    if (!selectedChild) return;
    setAssignLoading(true);
    setAssignMsg(null);
    try {
      await assignTest(selectedChild.id, assignTestCount);
      setAssignMsg(`Test assigned (${assignTestCount} words). He'll see it next time he opens the app.`);
      const updated = await fetchAssignedTests(selectedChild.id);
      setAssignedTests(updated);
    } catch (err) {
      console.error("Failed to assign test:", err);
      setAssignMsg("Failed to assign test.");
    } finally {
      setAssignLoading(false);
    }
  }, [selectedChild, assignTestCount]);

  // ── Placement trigger handler ──
  const handleTriggerPlacement = useCallback(async () => {
    if (!selectedChild) return;
    setPlacementLoading(true);
    setPlacementMsg(null);
    try {
      const result = await triggerPlacement(selectedChild.id, placementGrade);
      setPlacementMsg(
        `Placement quiz queued for ${result.childName}. He'll see it next time he opens the app.`,
      );
      // Update local state
      setSelectedChild({
        ...selectedChild,
        placementTaken: false,
        placementLevel: null,
      });
      setChildren((prev) =>
        prev.map((c) =>
          c.id === selectedChild.id
            ? { ...c, placementTaken: false, placementLevel: null }
            : c,
        ),
      );
    } catch (err) {
      console.error("Failed to trigger placement:", err);
      setPlacementMsg("Failed to trigger placement.");
    } finally {
      setPlacementLoading(false);
    }
  }, [selectedChild, placementGrade]);

  // ── Excuse attempt handler ──
  const handleExcuse = useCallback(
    async (attemptId: number, testId: number) => {
      if (!selectedChild) return;
      setExcusingId(attemptId);
      try {
        const result = await excuseAttempt(attemptId, selectedChild.id);
        if (result.excused) {
          // Refresh test data to reflect updated scores
          const updated = await fetchChildTests(selectedChild.id);
          setTests(updated);
        }
      } catch (err) {
        console.error("Failed to excuse attempt:", err);
      } finally {
        setExcusingId(null);
      }
    },
    [selectedChild],
  );

  // ── Pronunciation override handler ──
  const handlePronSave = useCallback(
    async (wordId: number) => {
      try {
        await setPronunciationOverride(wordId, pronInput);
        // Update local test data to reflect the change
        setTests((prev) =>
          prev.map((t) => ({
            ...t,
            words: t.words.map((w) =>
              w.wordId === wordId
                ? { ...w, pronunciationOverride: pronInput.trim() || null }
                : w,
            ),
          })),
        );
        setPronEditWordId(null);
        setPronInput("");
      } catch (err) {
        console.error("Failed to update pronunciation:", err);
      }
    },
    [pronInput],
  );

  // ── Re-teach trouble word (add back to rotation at current level) ──
  const handleReteach = useCallback(
    async (wordId: number, word: string) => {
      if (!selectedChild) return;
      try {
        // Try adding the word — if it's already in rotation this will just restore it
        await addChildWord(selectedChild.id, word, selectedChild.currentLevel);
        setTroubleWords((prev) => prev.filter((tw) => tw.id !== wordId));
      } catch (err) {
        console.error("Failed to reteach word:", err);
      }
    },
    [selectedChild],
  );

  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Teacher Dashboard</h1>
    </header>
  );

  if (loading) {
    return (
      <div className="app">
        {header}
        <p className="loading">Loading...</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="app">
        {header}
        <main className="card">
          <p className="login-sub">No children in your family yet.</p>
        </main>
        <button className="btn-link teacher-link" onClick={onLogout} type="button">
          Sign out
        </button>
      </div>
    );
  }

  // Compute word status counts
  const masteredCount = words.filter((w) => w.status === "mastered").length;
  const inProgressCount = words.filter((w) => w.status === "in_progress").length;
  const strugglingCount = words.filter((w) => w.status === "struggling").length;
  const notStartedCount = words.filter((w) => w.status === "not_started").length;

  return (
    <div className="app">
      {header}

      {/* Child selector */}
      {children.length > 1 && (
        <div className="child-selector">
          {children.map((c) => (
            <button
              key={c.id}
              className={`child-tab ${selectedChild?.id === c.id ? "child-tab-active" : ""}`}
              onClick={() => handleChildChange(c.id)}
              type="button"
            >
              {c.displayName}
            </button>
          ))}
        </div>
      )}

      {selectedChild && (
        <>
          {/* Stats bar */}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{selectedChild.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{selectedChild.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
            <div className="stat">
              <span className="stat-value">{selectedChild.currentLevel}</span>
              <span className="stat-label">level</span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="dash-tabs">
            <button
              className={`dash-tab ${tab === "overview" ? "dash-tab-active" : ""}`}
              onClick={() => setTab("overview")}
              type="button"
            >
              Overview
            </button>
            <button
              className={`dash-tab ${tab === "words" ? "dash-tab-active" : ""}`}
              onClick={() => setTab("words")}
              type="button"
            >
              Words
            </button>
            <button
              className={`dash-tab ${tab === "tests" ? "dash-tab-active" : ""}`}
              onClick={() => setTab("tests")}
              type="button"
            >
              Tests
            </button>
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <main className="card">
              <div className="overview-section">
                <p className="overview-label">Current Level</p>
                <p className="overview-value">{selectedChild.currentLevel}</p>
              </div>

              <div className="overview-section">
                <p className="overview-label">Day Streak</p>
                <p className="overview-value">
                  {selectedChild.currentStreak} day{selectedChild.currentStreak !== 1 ? "s" : ""}
                  <span className="overview-sub">
                    {" "}(longest: {selectedChild.longestStreak})
                  </span>
                </p>
              </div>

              <div className="overview-section">
                <p className="overview-label">Total Points</p>
                <p className="overview-value">{selectedChild.totalPoints} XP</p>
              </div>

              <div className="overview-section">
                <p className="overview-label">Last Active</p>
                <p className="overview-value">
                  {selectedChild.lastActive
                    ? new Date(selectedChild.lastActive).toLocaleDateString()
                    : "Never"}
                </p>
              </div>

              <div className="overview-section">
                <p className="overview-label">New Words Per Week</p>
                {weeklyEditing ? (
                  <div className="weekly-edit">
                    <input
                      className="weekly-input"
                      type="number"
                      min={1}
                      max={50}
                      value={weeklyCount}
                      onChange={(e) =>
                        setWeeklyCount(
                          Math.max(1, Math.min(50, parseInt(e.target.value) || 1)),
                        )
                      }
                    />
                    <button
                      className="btn btn-check btn-small"
                      onClick={handleWeeklySave}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="btn-link"
                      onClick={() => {
                        setWeeklyCount(selectedChild.weeklyNewWords);
                        setWeeklyEditing(false);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="overview-value">
                    {selectedChild.weeklyNewWords}{" "}
                    <button
                      className="btn-link-inline"
                      onClick={() => setWeeklyEditing(true)}
                      type="button"
                    >
                      Change
                    </button>
                  </p>
                )}
              </div>

              {/* ── Placement section ── */}
              <div className="overview-section">
                <p className="overview-label">Placement Test</p>
                <p className="overview-value">
                  {selectedChild.placementTaken
                    ? `Taken (level ${selectedChild.placementLevel})`
                    : "Not taken yet"}
                </p>
                <div className="placement-trigger">
                  <div className="placement-form">
                    <label className="placement-form-label">
                      Grade:
                      <select
                        className="grade-select"
                        value={placementGrade}
                        onChange={(e) => setPlacementGrade(parseInt(e.target.value, 10))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn btn-check btn-small"
                      onClick={handleTriggerPlacement}
                      disabled={placementLoading}
                      type="button"
                    >
                      {placementLoading
                        ? "..."
                        : selectedChild.placementTaken
                          ? "Re-run placement"
                          : "Start placement"}
                    </button>
                  </div>
                  {placementMsg && (
                    <p className="action-msg">{placementMsg}</p>
                  )}
                </div>
              </div>

              {/* ── Words to Watch ── */}
              {troubleWords.length > 0 && (
                <div className="overview-section">
                  <p className="overview-label">Words to Watch</p>
                  <p className="trouble-sub">
                    Words he keeps missing — tap to roll into his rotation.
                  </p>
                  <div className="trouble-list">
                    {troubleWords.map((tw) => (
                      <div key={tw.id} className="trouble-row">
                        <div className="trouble-row-main">
                          <span className="trouble-word">{tw.word}</span>
                          <span className="trouble-stats">
                            {tw.missCount} missed / {tw.totalAttempts} tries
                          </span>
                        </div>
                        <div className="trouble-row-detail">
                          <span className="trouble-def">{tw.definition}</span>
                          <button
                            className="btn-link-inline"
                            onClick={() => handleReteach(tw.id, tw.word)}
                            type="button"
                          >
                            Re-teach
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </main>
          )}

          {/* ── WORDS TAB ── */}
          {tab === "words" && (
            <main className="card">
              {/* Add word form */}
              <div className="add-word-section">
                <p className="overview-label">Add a Word</p>
                <div className="add-word-form">
                  <input
                    className="add-word-input"
                    type="text"
                    placeholder="Type a word..."
                    value={addWordInput}
                    onChange={(e) => setAddWordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && addWordInput.trim()) handleAddWord();
                    }}
                    disabled={addWordLoading}
                  />
                  <select
                    className="grade-select"
                    value={addWordGrade}
                    onChange={(e) => setAddWordGrade(parseInt(e.target.value, 10))}
                    disabled={addWordLoading}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                      <option key={g} value={g}>
                        Gr {g}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-check btn-small"
                    onClick={handleAddWord}
                    disabled={addWordLoading || !addWordInput.trim()}
                    type="button"
                  >
                    {addWordLoading ? "..." : "Add"}
                  </button>
                </div>
                {addWordMsg && <p className="action-msg">{addWordMsg}</p>}
              </div>

              <div className="word-summary-bar">
                <span className="word-summary-chip chip-mastered">
                  {masteredCount} mastered
                </span>
                <span className="word-summary-chip chip-progress">
                  {inProgressCount} in progress
                </span>
                <span className="word-summary-chip chip-struggling">
                  {strugglingCount} struggling
                </span>
                {notStartedCount > 0 && (
                  <span className="word-summary-chip chip-not-started">
                    {notStartedCount} not started
                  </span>
                )}
              </div>

              <div className="word-list">
                {words.map((w) => (
                  <div key={w.id} className={`word-row word-row-${w.status}`}>
                    <div className="word-row-main">
                      <span className="word-row-word">{w.word}</span>
                      <div className="word-row-actions">
                        <span className={`word-status-badge status-${w.status}`}>
                          {w.status === "mastered"
                            ? "Mastered"
                            : w.status === "struggling"
                              ? "Struggling"
                              : w.status === "in_progress"
                                ? "In Progress"
                                : "Not Started"}
                        </span>
                        <button
                          className="btn-delete-word"
                          onClick={() => handleDeleteWord(w.id)}
                          title="Remove from rotation"
                          type="button"
                        >
                          &#x2715;
                        </button>
                      </div>
                    </div>
                    <div className="word-row-detail">
                      <span className="word-row-def">{w.definition}</span>
                      <span className="word-row-score">
                        Score: {w.masteryScore.toFixed(1)}/10
                      </span>
                    </div>
                  </div>
                ))}
                {words.length === 0 && (
                  <p className="login-sub">No words at this level yet.</p>
                )}
              </div>
            </main>
          )}

          {/* ── TESTS TAB ── */}
          {tab === "tests" && (
            <main className="card">
              {/* Assign test section */}
              <div className="assign-test-section">
                <p className="overview-label">Assign a Test</p>
                <div className="assign-test-form">
                  <label className="assign-test-label">
                    Words:
                    <input
                      className="weekly-input"
                      type="number"
                      min={1}
                      max={40}
                      value={assignTestCount}
                      onChange={(e) =>
                        setAssignTestCount(
                          Math.max(1, Math.min(40, parseInt(e.target.value) || 10)),
                        )
                      }
                    />
                  </label>
                  <button
                    className="btn btn-check btn-small"
                    onClick={handleAssignTest}
                    disabled={assignLoading}
                    type="button"
                  >
                    {assignLoading ? "..." : "Assign test"}
                  </button>
                </div>
                {assignMsg && <p className="action-msg">{assignMsg}</p>}
              </div>

              {/* Assigned tests */}
              {assignedTests.length > 0 && (
                <div className="assigned-tests-list">
                  <p className="overview-label">Assigned Tests</p>
                  {assignedTests.map((at) => (
                    <div key={at.id} className="assigned-test-card">
                      <div className="assigned-test-header">
                        <span className="test-date">
                          {new Date(at.assignedAt).toLocaleDateString()}
                        </span>
                        <span
                          className={`assigned-test-badge ${
                            at.status === "pending"
                              ? "badge-pending"
                              : "badge-completed"
                          }`}
                        >
                          {at.status === "pending" ? "Pending" : "Completed"}
                        </span>
                      </div>
                      <div className="assigned-test-detail">
                        {at.status === "completed" && at.accuracy !== null ? (
                          <span className="test-detail">
                            Score: {Math.round(at.accuracy * 100)}% ({at.correctCount}/
                            {at.totalWords})
                          </span>
                        ) : (
                          <span className="test-detail">{at.wordCount} words</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Past test results (organic) */}
              {tests.length > 0 && (
                <>
                  <p className="overview-label" style={{ marginTop: 8 }}>
                    Test History
                  </p>
                  <div className="test-list">
                    {tests.map((t) => (
                      <div key={t.id} className="test-card">
                        <button
                          className="test-card-header"
                          onClick={() =>
                            setExpandedTest(expandedTest === t.id ? null : t.id)
                          }
                          type="button"
                        >
                          <div className="test-card-left">
                            <span className="test-date">
                              {new Date(t.createdAt).toLocaleDateString()}
                            </span>
                            <span className="test-level">
                              Level {t.levelAtStart}
                              {t.levelAtEnd !== t.levelAtStart && (
                                <> &rarr; {t.levelAtEnd}</>
                              )}
                            </span>
                          </div>
                          <div className="test-card-right">
                            <span
                              className={`test-score ${
                                t.accuracy >= 0.9
                                  ? "test-score-good"
                                  : t.accuracy >= 0.7
                                    ? "test-score-ok"
                                    : "test-score-low"
                              }`}
                            >
                              {Math.round(t.accuracy * 100)}%
                            </span>
                            <span className="test-detail">
                              {t.correctCount}/{t.totalWords}
                            </span>
                          </div>
                        </button>

                        {expandedTest === t.id && t.words.length > 0 && (
                          <div className="test-breakdown">
                            {t.words.map((w) => (
                              <div
                                key={w.attemptId}
                                className={`test-word-row ${
                                  w.correct
                                    ? "test-word-correct"
                                    : "test-word-wrong"
                                }`}
                              >
                                <span className="test-word-icon">
                                  {w.correct ? "\u2713" : "\u2717"}
                                </span>
                                <span className="test-word-text">{w.word}</span>
                                {!w.correct && (
                                  <>
                                    <span className="test-word-given">
                                      {w.answerGiven}
                                    </span>
                                    <button
                                      className="btn-excuse"
                                      onClick={() =>
                                        handleExcuse(w.attemptId, t.id)
                                      }
                                      disabled={excusingId === w.attemptId}
                                      title="Excuse this answer"
                                      type="button"
                                    >
                                      {excusingId === w.attemptId
                                        ? "..."
                                        : "Excuse"}
                                    </button>
                                  </>
                                )}
                                {/* Pronunciation override */}
                                {pronEditWordId === w.wordId ? (
                                  <div className="pron-edit">
                                    <input
                                      className="pron-input"
                                      type="text"
                                      value={pronInput}
                                      onChange={(e) =>
                                        setPronInput(e.target.value)
                                      }
                                      placeholder="e.g. deh-zert"
                                    />
                                    <button
                                      className="btn-link-inline"
                                      onClick={() =>
                                        handlePronSave(w.wordId)
                                      }
                                      type="button"
                                    >
                                      Save
                                    </button>
                                    <button
                                      className="btn-link-inline"
                                      onClick={() => {
                                        setPronEditWordId(null);
                                        setPronInput("");
                                      }}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="btn-pron"
                                    onClick={() => {
                                      setPronEditWordId(w.wordId);
                                      setPronInput(
                                        w.pronunciationOverride ?? "",
                                      );
                                    }}
                                    title={
                                      w.pronunciationOverride
                                        ? `Override: ${w.pronunciationOverride}`
                                        : "Set pronunciation override"
                                    }
                                    type="button"
                                  >
                                    {w.pronunciationOverride ? "voice*" : "voice"}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tests.length === 0 && assignedTests.length === 0 && (
                <p className="login-sub">No tests yet.</p>
              )}
            </main>
          )}
        </>
      )}

      <button className="btn-link teacher-link" onClick={onLogout} type="button">
        Sign out
      </button>
    </div>
  );
}
