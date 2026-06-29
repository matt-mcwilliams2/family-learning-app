import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import { Login } from "./Login";
import { TeacherDashboard } from "./TeacherDashboard";
import {
  getToken,
  clearToken,
  setCurrentUserId,
  fetchMe,
  type AuthUser,
} from "./api";

export function AuthRoot() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  // On mount, check for an existing token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }
    fetchMe()
      .then((u) => {
        setCurrentUserId(u.id);
        setUser(u);
        setChecking(false);
      })
      .catch(() => {
        clearToken();
        setChecking(false);
      });
  }, []);

  const handleLogin = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  if (checking) {
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

  // Not logged in → show login screen
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Parent → show teacher dashboard
  if (user.role === "parent") {
    return <TeacherDashboard onLogout={handleLogout} />;
  }

  // Child → show the spelling app
  return <App onLogout={handleLogout} />;
}
