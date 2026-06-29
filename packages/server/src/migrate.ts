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

const UP_002 = `
-- Cached mastery score per user + word.
-- Recomputable from the attempts table at any time, but cached here
-- so the scheduler can query it without scanning all attempts.
CREATE TABLE IF NOT EXISTS word_mastery (
  user_id          INTEGER NOT NULL REFERENCES users(id),
  word_id          INTEGER NOT NULL REFERENCES words(id),
  app              TEXT NOT NULL DEFAULT 'spelling',
  mastery_score    NUMERIC(3,1) NOT NULL DEFAULT 0,
  has_ever_missed  BOOLEAN NOT NULL DEFAULT false,
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  next_review_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, word_id, app)
);

CREATE INDEX IF NOT EXISTS idx_word_mastery_review
  ON word_mastery(user_id, app, next_review_at);

-- Completed sessions, used to compute accuracy windows for adaptive leveling.
CREATE TABLE IF NOT EXISTS sessions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  app             TEXT NOT NULL DEFAULT 'spelling',
  mode            TEXT NOT NULL CHECK (mode IN ('learn', 'practice', 'test')),
  total_words     INTEGER NOT NULL,
  correct_count   INTEGER NOT NULL,
  accuracy        NUMERIC(5,4) NOT NULL,
  level_at_start  NUMERIC(3,1) NOT NULL,
  level_at_end    NUMERIC(3,1) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions(user_id, app, created_at);
`;

interface Migration {
  name: string;
  sql: string;
}

const UP_003 = `
-- Track whether a student has taken the placement test.
-- NULL means not yet taken; a value is the computed starting level.
ALTER TABLE users ADD COLUMN IF NOT EXISTS placement_level NUMERIC(3,1);

-- Track which exercise types a student has seen each word in,
-- so we know when a word counts as "introduced" (2+ types).
-- This is a materialized cache; recomputable from attempts.
CREATE TABLE IF NOT EXISTS word_introductions (
  user_id        INTEGER NOT NULL REFERENCES users(id),
  word_id        INTEGER NOT NULL REFERENCES words(id),
  app            TEXT NOT NULL DEFAULT 'spelling',
  exercise_types TEXT[] NOT NULL DEFAULT '{}',
  introduced     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, word_id, app)
);
`;

const UP_004 = `
-- Earned badges per user per app.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  badge_id   TEXT NOT NULL,
  app        TEXT NOT NULL DEFAULT 'spelling',
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id, app)
);
`;

const UP_005 = `
-- Per-child weekly new-word count, set by parent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_new_words INTEGER NOT NULL DEFAULT 10;
`;

const UP_006 = `
-- Excluded words per child (parent removes from rotation)
CREATE TABLE IF NOT EXISTS excluded_words (
  child_id    INTEGER NOT NULL REFERENCES users(id),
  word_id     INTEGER NOT NULL REFERENCES words(id),
  excluded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_id, word_id)
);

-- Teacher-assigned tests
CREATE TABLE IF NOT EXISTS assigned_tests (
  id           SERIAL PRIMARY KEY,
  child_id     INTEGER NOT NULL REFERENCES users(id),
  family_id    INTEGER NOT NULL REFERENCES families(id),
  assigned_by  INTEGER NOT NULL REFERENCES users(id),
  word_count   INTEGER NOT NULL DEFAULT 10,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  session_id   INTEGER REFERENCES sessions(id),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assigned_tests_child
  ON assigned_tests(child_id, status);
`;

const MIGRATIONS: Migration[] = [
  { name: "001_initial_schema", sql: UP },
  { name: "002_mastery_and_sessions", sql: UP_002 },
  { name: "003_placement_and_introductions", sql: UP_003 },
  { name: "004_badges", sql: UP_004 },
  { name: "005_weekly_new_words", sql: UP_005 },
  { name: "006_excluded_words_and_assigned_tests", sql: UP_006 },
];

async function migrate() {
  const client = await pool.connect();
  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of MIGRATIONS) {
      await client.query("BEGIN");

      const existing = await client.query(
        "SELECT 1 FROM migrations WHERE name = $1",
        [migration.name],
      );

      if (existing.rows.length > 0) {
        console.log(`Migration ${migration.name} already applied, skipping.`);
        await client.query("COMMIT");
        continue;
      }

      await client.query(migration.sql);

      await client.query(
        "INSERT INTO migrations (name) VALUES ($1)",
        [migration.name],
      );

      await client.query("COMMIT");
      console.log(`Migration ${migration.name} applied successfully.`);
    }
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
