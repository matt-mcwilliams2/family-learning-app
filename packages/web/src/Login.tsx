import { useCallback, useEffect, useState } from "react";
import {
  fetchProfiles,
  loginParent,
  loginChild,
  setToken,
  setCurrentUserId,
  type AuthUser,
  type ChildProfile,
} from "./api";

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<"profiles" | "pin" | "parent">("profiles");
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ChildProfile | null>(null);
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles()
      .then((p) => {
        setProfiles(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChildSelect = useCallback((profile: ChildProfile) => {
    setSelectedProfile(profile);
    setPin("");
    setError("");
    setMode("pin");
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (!selectedProfile || !pin.trim()) return;
    setError("");
    try {
      const result = await loginChild(selectedProfile.id, pin.trim());
      setToken(result.token);
      setCurrentUserId(result.user.id);
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || "Wrong PIN");
    }
  }, [selectedProfile, pin, onLogin]);

  const handleParentSubmit = useCallback(async () => {
    if (!email.trim() || !password) return;
    setError("");
    try {
      const result = await loginParent(email.trim(), password);
      setToken(result.token);
      setCurrentUserId(result.user.id);
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  }, [email, password, onLogin]);

  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Spelling</h1>
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

  // ── Parent login ──
  if (mode === "parent") {
    return (
      <div className="app">
        {header}
        <main className="card">
          <p className="mode-heading">Teacher Login</p>
          {error && <p className="login-error">{error}</p>}

          <input
            className="login-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParentSubmit()}
            autoComplete="email"
          />
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParentSubmit()}
            autoComplete="current-password"
          />

          <button
            className="btn btn-check"
            onClick={handleParentSubmit}
            disabled={!email.trim() || !password}
            type="button"
          >
            Sign in
          </button>

          <button
            className="btn-link"
            onClick={() => { setMode("profiles"); setError(""); }}
            type="button"
          >
            Back to profiles
          </button>
        </main>
      </div>
    );
  }

  // ── PIN entry ──
  if (mode === "pin" && selectedProfile) {
    return (
      <div className="app">
        {header}
        <main className="card">
          <p className="mode-heading">Hi, {selectedProfile.displayName}!</p>
          <p className="login-sub">Enter your PIN</p>
          {error && <p className="login-error">{error}</p>}

          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="----"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
            autoComplete="off"
            autoFocus
          />

          <button
            className="btn btn-check"
            onClick={handlePinSubmit}
            disabled={pin.length < 4}
            type="button"
          >
            Go
          </button>

          <button
            className="btn-link"
            onClick={() => { setMode("profiles"); setError(""); }}
            type="button"
          >
            Pick a different profile
          </button>
        </main>
      </div>
    );
  }

  // ── Profile picker ──
  return (
    <div className="app">
      {header}
      <main className="card">
        <p className="mode-heading">Who's practicing?</p>

        <div className="profiles-grid">
          {profiles.map((p) => (
            <button
              key={p.id}
              className="profile-card"
              onClick={() => handleChildSelect(p)}
              type="button"
            >
              <span className="profile-avatar">
                {p.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="profile-name">{p.displayName}</span>
            </button>
          ))}
        </div>

        {profiles.length === 0 && (
          <p className="login-sub">No profiles yet. Ask a parent to set things up.</p>
        )}
      </main>

      <button
        className="btn-link teacher-link"
        onClick={() => { setMode("parent"); setError(""); }}
        type="button"
      >
        Teacher login
      </button>
    </div>
  );
}
