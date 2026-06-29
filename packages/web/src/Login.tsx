import { useCallback, useState } from "react";
import {
  loginParent,
  loginChild,
  setToken,
  setCurrentUserId,
  type AuthUser,
} from "./api";

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<"student" | "parent">("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [error, setError] = useState("");

  const handleStudentSubmit = useCallback(async () => {
    if (!username.trim() || !password) return;
    setError("");
    try {
      const result = await loginChild(username.trim(), password);
      setToken(result.token);
      setCurrentUserId(result.user.id);
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  }, [username, password, onLogin]);

  const handleParentSubmit = useCallback(async () => {
    if (!email.trim() || !parentPassword) return;
    setError("");
    try {
      const result = await loginParent(email.trim(), parentPassword);
      setToken(result.token);
      setCurrentUserId(result.user.id);
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  }, [email, parentPassword, onLogin]);

  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Spelling</h1>
    </header>
  );

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
            value={parentPassword}
            onChange={(e) => setParentPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParentSubmit()}
            autoComplete="current-password"
          />

          <button
            className="btn btn-check"
            onClick={handleParentSubmit}
            disabled={!email.trim() || !parentPassword}
            type="button"
          >
            Sign in
          </button>

          <button
            className="btn-link"
            onClick={() => { setMode("student"); setError(""); }}
            type="button"
          >
            Student login
          </button>
        </main>
      </div>
    );
  }

  // ── Student login ──
  return (
    <div className="app">
      {header}
      <main className="card">
        <p className="mode-heading">Student Login</p>
        {error && <p className="login-error">{error}</p>}

        <input
          className="login-input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStudentSubmit()}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStudentSubmit()}
          autoComplete="current-password"
        />

        <button
          className="btn btn-check"
          onClick={handleStudentSubmit}
          disabled={!username.trim() || !password}
          type="button"
        >
          Sign in
        </button>
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
