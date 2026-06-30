import { useCallback, useEffect, useState } from "react";
import {
  fetchChildren,
  fetchChildMathSessions,
  fetchChildMathRecords,
  fetchChildMathStats,
  type ChildSummary,
  type MathSessionSummary,
  type MathRecords,
} from "./api";
import "./App.css";

interface MathTeacherViewProps {
  onBack: () => void;
  onLogout: () => void;
}

const OP_LABELS: Record<string, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
};

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function MathTeacherView({ onBack, onLogout }: MathTeacherViewProps) {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState<MathSessionSummary[]>([]);
  const [records, setRecords] = useState<MathRecords | null>(null);
  const [mathStats, setMathStats] = useState<{
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
  } | null>(null);

  useEffect(() => {
    fetchChildren()
      .then((c) => {
        const active = c.filter((ch) => ch.active !== false);
        setChildren(active);
        if (active.length > 0) {
          setSelectedChild(active[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    fetchChildMathSessions(selectedChild.id)
      .then(setSessions)
      .catch(console.error);
    fetchChildMathRecords(selectedChild.id)
      .then(setRecords)
      .catch(console.error);
    fetchChildMathStats(selectedChild.id)
      .then((s) =>
        setMathStats({
          totalPoints: s.totalPoints,
          currentStreak: s.currentStreak,
          longestStreak: s.longestStreak,
        }),
      )
      .catch(console.error);
  }, [selectedChild]);

  const handleChildChange = useCallback(
    (id: number) => {
      const child = children.find((c) => c.id === id);
      if (child) setSelectedChild(child);
    },
    [children],
  );

  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Speed Math" className="logo" />
      <h1 className="title">Speed Math — Teacher</h1>
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
          <p className="login-sub">No students yet.</p>
        </main>
        <button className="btn-link teacher-link" onClick={onBack} type="button">
          Back to apps
        </button>
      </div>
    );
  }

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

      {selectedChild && mathStats && (
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{mathStats.totalPoints}</span>
            <span className="stat-label">XP</span>
          </div>
          <div className="stat">
            <span className="stat-value">{mathStats.currentStreak}</span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{mathStats.longestStreak}</span>
            <span className="stat-label">best streak</span>
          </div>
        </div>
      )}

      {selectedChild && (
        <main className="card">
          {/* Personal records */}
          <div className="overview-section">
            <p className="overview-label">Personal Records</p>
            {records ? (
              <div className="math-records-grid">
                {(["addition", "subtraction", "multiplication", "division"] as const).map(
                  (op) => (
                    <div key={op} className="math-record-row">
                      <span className="math-record-op">{OP_LABELS[op]}</span>
                      <span className="math-record-time">
                        {records[op]
                          ? formatTime(records[op]!.bestTimeSecs)
                          : "—"}
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="login-sub">No records yet.</p>
            )}
          </div>

          {/* Recent sessions */}
          <div className="overview-section">
            <p className="overview-label">Recent Sessions</p>
            {sessions.length > 0 ? (
              <div className="math-sessions-list">
                {sessions.map((s) => {
                  const accuracy =
                    s.totalProblems > 0
                      ? Math.round((s.correctCount / s.totalProblems) * 100)
                      : 0;
                  return (
                    <div key={s.id} className="math-session-row">
                      <div className="math-session-main">
                        <span className="math-session-op">
                          {OP_LABELS[s.operation] ?? s.operation}
                        </span>
                        <span className="math-session-date">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="math-session-detail">
                        <span>
                          {s.correctCount}/{s.totalProblems} ({accuracy}%)
                        </span>
                        {s.allCorrect && s.elapsedSecs && (
                          <span className="math-session-time">
                            {formatTime(s.elapsedSecs)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="login-sub">No sessions yet.</p>
            )}
          </div>
        </main>
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
