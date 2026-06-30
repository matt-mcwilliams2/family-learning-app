import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import { Login } from "./Login";
import { AdminLogin } from "./AdminLogin";
import { TeacherDashboard } from "./TeacherDashboard";
import { AdminDashboard } from "./AdminDashboard";
import { AppChooser } from "./AppChooser";
import { SpeedMath } from "./SpeedMath";
import { MathTeacherView } from "./MathTeacherView";
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
  const [chosenApp, setChosenApp] = useState<"spelling" | "math" | null>(null);

  const isAdminLoginPath = window.location.pathname === "/admin/login";

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
    const wasAdmin = user?.role === "admin";
    clearToken();
    setUser(null);
    setChosenApp(null);
    if (wasAdmin) {
      window.history.replaceState(null, "", "/admin/login");
    }
  }, [user]);

  if (checking) {
    return (
      <div className="app">
        <header className="header">
          <img src="/logo-square.png" alt="Family Learning" className="logo" />
          <h1 className="title">Loading...</h1>
        </header>
        <p className="loading">Loading...</p>
      </div>
    );
  }

  // Not logged in → show login screen
  if (!user) {
    if (isAdminLoginPath) {
      return <AdminLogin onLogin={handleLogin} />;
    }
    return <Login onLogin={handleLogin} />;
  }

  // Admin → show admin dashboard (no chooser)
  if (user.role === "admin") {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // App chooser for parents and children
  if (!chosenApp) {
    return (
      <AppChooser
        onChoose={setChosenApp}
        onLogout={handleLogout}
        userName={user.displayName}
      />
    );
  }

  // Parent
  if (user.role === "parent") {
    if (chosenApp === "math") {
      return (
        <MathTeacherView
          onBack={() => setChosenApp(null)}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <TeacherDashboard
        onBack={() => setChosenApp(null)}
        onLogout={handleLogout}
      />
    );
  }

  // Child
  if (chosenApp === "math") {
    return (
      <SpeedMath
        onBack={() => setChosenApp(null)}
        onLogout={handleLogout}
      />
    );
  }
  return (
    <App
      onBack={() => setChosenApp(null)}
      onLogout={handleLogout}
    />
  );
}
