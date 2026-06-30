import { useCallback, useEffect, useState } from "react";
import {
  fetchTeachers,
  createTeacher,
  resetTeacherPassword,
  type TeacherSummary,
} from "./api";

interface AdminDashboardProps {
  onLogout: () => void;
}

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Add teacher form
  const [showAdd, setShowAdd] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  // Reset password
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const loadTeachers = useCallback(async () => {
    try {
      const data = await fetchTeachers();
      setTeachers(data);
    } catch (err) {
      console.error("Failed to load teachers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const handleAddTeacher = useCallback(async () => {
    if (!addFirstName.trim() || !addLastName.trim() || !addEmail.trim() || !addPassword) return;
    setAddLoading(true);
    setAddMsg("");
    try {
      await createTeacher({
        firstName: addFirstName.trim(),
        lastName: addLastName.trim(),
        email: addEmail.trim(),
        password: addPassword,
      });
      setAddMsg("Teacher created.");
      setAddFirstName("");
      setAddLastName("");
      setAddEmail("");
      setAddPassword("");
      setShowAdd(false);
      loadTeachers();
    } catch (err: any) {
      setAddMsg(err.message || "Failed to create teacher");
    } finally {
      setAddLoading(false);
    }
  }, [addFirstName, addLastName, addEmail, addPassword, loadTeachers]);

  const handleResetPassword = useCallback(async () => {
    if (resetId == null || !resetPw) return;
    setResetMsg("");
    try {
      await resetTeacherPassword(resetId, resetPw);
      setResetMsg("Password reset.");
      setResetPw("");
      setResetId(null);
    } catch (err: any) {
      setResetMsg(err.message || "Failed to reset password");
    }
  }, [resetId, resetPw]);

  return (
    <div className="app">
      <header className="header">
        <img src="/logo-square.png" alt="Family Spelling" className="logo" />
        <h1 className="title">Admin Dashboard</h1>
      </header>

      <main className="card">
        <div className="overview-section">
          <p className="overview-label">Teachers</p>
          <button
            className="btn btn-check btn-small"
            onClick={() => { setShowAdd(!showAdd); setAddMsg(""); }}
            type="button"
          >
            {showAdd ? "Cancel" : "Add Teacher"}
          </button>
        </div>

        {addMsg && <p className="action-msg">{addMsg}</p>}

        {showAdd && (
          <div className="overview-section" style={{ borderTop: "1px solid #ddd", paddingTop: 12 }}>
            <input
              className="login-input"
              type="text"
              placeholder="First name"
              value={addFirstName}
              onChange={(e) => setAddFirstName(e.target.value)}
              autoCapitalize="words"
            />
            <input
              className="login-input"
              type="text"
              placeholder="Last name"
              value={addLastName}
              onChange={(e) => setAddLastName(e.target.value)}
              autoCapitalize="words"
            />
            <input
              className="login-input"
              type="email"
              placeholder="Email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              autoComplete="off"
            />
            <input
              className="login-input"
              type="text"
              placeholder="Password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              autoComplete="off"
            />
            <button
              className="btn btn-check"
              onClick={handleAddTeacher}
              disabled={addLoading || !addFirstName.trim() || !addLastName.trim() || !addEmail.trim() || !addPassword}
              type="button"
            >
              {addLoading ? "Creating..." : "Create Teacher"}
            </button>
          </div>
        )}

        {loading && <p className="loading">Loading...</p>}

        {!loading && teachers.length === 0 && (
          <p style={{ color: "#888", textAlign: "center", padding: 16 }}>No teachers yet.</p>
        )}

        {teachers.map((t) => (
          <div key={t.id} className="student-row">
            <div className="student-info">
              <span className="student-name">
                {t.firstName ?? ""} {t.lastName ?? ""}
              </span>
              <span className="student-detail">{t.email}</span>
            </div>
            <div className="student-actions">
              {resetId === t.id ? (
                <>
                  <input
                    className="login-input"
                    style={{ width: 140, margin: 0, padding: "4px 8px", fontSize: 13 }}
                    type="text"
                    placeholder="New password"
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    className="btn-link-inline"
                    onClick={handleResetPassword}
                    disabled={!resetPw}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    className="btn-link-inline"
                    onClick={() => { setResetId(null); setResetPw(""); setResetMsg(""); }}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="btn-link-inline"
                  onClick={() => { setResetId(t.id); setResetPw(""); setResetMsg(""); }}
                  type="button"
                >
                  Reset Password
                </button>
              )}
            </div>
          </div>
        ))}

        {resetMsg && <p className="action-msg">{resetMsg}</p>}
      </main>

      <button className="btn-link teacher-link" onClick={onLogout} type="button">
        Sign out
      </button>
    </div>
  );
}
