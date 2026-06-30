import { useCallback, useState } from "react";
import {
  loginAdmin,
  setToken,
  setCurrentUserId,
  type AuthUser,
} from "./api";

interface AdminLoginProps {
  onLogin: (user: AuthUser) => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !password) return;
    setError("");
    try {
      const result = await loginAdmin(email.trim(), password);
      setToken(result.token);
      setCurrentUserId(result.user.id);
      onLogin(result.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  }, [email, password, onLogin]);

  return (
    <div className="app">
      <header className="header">
        <img src="/logo-square.png" alt="Family Spelling" className="logo" />
        <h1 className="title">Spelling</h1>
      </header>
      <main className="card">
        <p className="mode-heading">Admin Login</p>
        {error && <p className="login-error">{error}</p>}

        <input
          className="login-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoComplete="email"
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoComplete="current-password"
        />

        <button
          className="btn btn-check"
          onClick={handleSubmit}
          disabled={!email.trim() || !password}
          type="button"
        >
          Sign in
        </button>
      </main>
    </div>
  );
}
