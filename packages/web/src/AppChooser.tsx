import "./App.css";

interface AppChooserProps {
  onChoose: (app: "spelling" | "math") => void;
  onLogout: () => void;
  userName: string;
}

export function AppChooser({ onChoose, onLogout, userName }: AppChooserProps) {
  return (
    <div className="app">
      <header className="header">
        <img src="/logo-square.png" alt="Family Learning" className="logo" />
        <h1 className="title">Welcome, {userName}</h1>
      </header>

      <main className="card">
        <p className="mode-heading">Choose an app</p>

        <button
          className="btn btn-app-spelling"
          onClick={() => onChoose("spelling")}
          type="button"
        >
          Spelling
        </button>
        <p className="mode-desc">
          Learn, practice, and test your spelling skills.
        </p>

        <button
          className="btn btn-app-math"
          onClick={() => onChoose("math")}
          type="button"
        >
          Speed Math
        </button>
        <p className="mode-desc">
          Race through math problems against the clock.
        </p>
      </main>

      <button className="btn-link teacher-link" onClick={onLogout} type="button">
        Sign out
      </button>
    </div>
  );
}
