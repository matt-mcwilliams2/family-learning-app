import pool from "./db.js";

const UP = `
-- Track which migrations have run
CREATE TABLE IF NOT EXISTS migrations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Families
CREATE TABLE IF NOT EXISTS families (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (parents and children, shared across all apps)
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  family_id   INTEGER NOT NULL REFERENCES families(id),
  display_name TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  pin         TEXT,            -- short PIN for child login
  email       TEXT,            -- for parent accounts
  password_hash TEXT,          -- for parent accounts
  current_level NUMERIC(3,1) DEFAULT 6.0,  -- half-level precision
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);

-- Words (content table, namespaced by app)
CREATE TABLE IF NOT EXISTS words (
  id          SERIAL PRIMARY KEY,
  app         TEXT NOT NULL DEFAULT 'spelling',  -- spelling | math | spanish
  word        TEXT NOT NULL,
  grade       NUMERIC(3,1) NOT NULL,             -- e.g. 6.0, 6.5
  definition  TEXT NOT NULL,
  example     TEXT,
  syllables   TEXT,                               -- e.g. "ac-com-mo-date"
  pronunciation_override TEXT,                    -- phonetic override for TTS
  source      TEXT NOT NULL DEFAULT 'bank' CHECK (source IN ('bank', 'parent')),
  added_by    INTEGER REFERENCES users(id),       -- NULL for bank words, user id for parent-added
  family_id   INTEGER REFERENCES families(id),    -- NULL for bank words, set for parent-added
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_words_app_grade ON words(app, grade);

-- Attempts (one row per try, shared across apps)
CREATE TABLE IF NOT EXISTS attempts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  word_id       INTEGER NOT NULL REFERENCES words(id),
  app           TEXT NOT NULL DEFAULT 'spelling',
  exercise_type TEXT NOT NULL,    -- hear_and_spell, match_definition, jumble, etc.
  mode          TEXT NOT NULL CHECK (mode IN ('learn', 'practice', 'test')),
  correct       BOOLEAN NOT NULL,
  answer_given  TEXT,             -- what the child typed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_word ON attempts(user_id, word_id);

-- Per-child stats rollup (shared across apps, one row per user per app)
CREATE TABLE IF NOT EXISTS user_stats (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  app             TEXT NOT NULL DEFAULT 'spelling',
  total_points    INTEGER NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_active     DATE,
  UNIQUE(user_id, app)
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if this migration already ran
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await client.query(
      "SELECT 1 FROM migrations WHERE name = $1",
      ["001_initial_schema"],
    );

    if (existing.rows.length > 0) {
      console.log("Migration 001_initial_schema already applied, skipping.");
      await client.query("COMMIT");
      return;
    }

    await client.query(UP);

    await client.query(
      "INSERT INTO migrations (name) VALUES ($1)",
      ["001_initial_schema"],
    );

    await client.query("COMMIT");
    console.log("Migration 001_initial_schema applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
