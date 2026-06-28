# Family learning apps

A small suite of Duolingo-style learning apps for our two kids: short daily
sessions, points, badges, streaks, wins and losses. Three apps to start:
spelling, math, and Spanish. They are separate apps that share one login, one
design system, and one progress engine.

Build the spelling app first and build it well. Math and Spanish come later and
reuse the shared platform.

## How to work in this project

- Default to building real, working code. Move incrementally. Show the smallest
  thing that runs, then add to it.
- Ask before introducing a new dependency or service, and before committing to a
  framework. When a decision has real tradeoffs (cost, complexity, a new
  service), lay out the options and ask before committing.
- Default to free and simple. We'd rather add complexity later than carry it
  early.
- Build the spelling app end to end before starting math or Spanish. Prove the
  shared platform (auth, Postgres schema, gamification engine, spaced
  repetition, PWA shell) on spelling first.
- Keep the gamification and spaced-repetition logic in a shared layer the other
  two apps can reuse. Per-app content plugs into it.
- Design the Postgres schema to serve all three apps: accounts and roles are
  shared; content and progress are namespaced per app.

## Who uses these

Two kids and two parents.

- Son, 10, going into 6th grade. Reads at a 6th grade level or higher, about 6th
  grade across the board. He is the spelling app's first and main user.
- Daughter, 15, going into her junior year. Reads at a college level, has done
  Duolingo for 3 years. She'll use the Spanish app only, later. Don't water down
  her content.
- Parents act as the "teacher." A parent can view each child's progress and test
  results from their own phone, set how many words a week the child gets, and add
  their own words.

The kids and parents are separate accounts with separate views. A child never
sees the parent dashboard.

## The platform (shared across all three apps)

### Delivery

Progressive web app. The kids add it to their home screen from Safari on iOS, so
it has to feel like an app: full-screen, offline-tolerant for an in-progress
session, fast to open. Treat iOS Safari as the primary target and test against
its quirks.

### Stack

- Backend and hosting on Railway.
- Postgres for all data: accounts, word banks, progress, mastery scores, session
  history, test results.
- A single auth service shared by all three apps. One family logs in once; the
  same identity carries across spelling, math, and Spanish.
- Frontend as a PWA with a service worker and a web app manifest so "Add to Home
  Screen" works cleanly on iOS.
- Frontend: React + TypeScript + Vite, with vite-plugin-pwa for the service
  worker and manifest.
- Backend: Node.js + Express + TypeScript.
- Database access: plain SQL with the `pg` driver. No ORM. Use a migration tool
  (node-pg-migrate or similar) for schema changes.
- Project layout: npm workspaces under `packages/` — `shared` (gamification,
  spaced repetition, DB queries, types), `web` (Vite PWA), `server` (Express
  API). Math and Spanish get their own packages later.

### Accounts and roles

- A family has one parent (teacher) account and one or more child accounts.
- The parent creates and manages child profiles, sets the weekly word count per
  child, adds custom words, and views progress and test results.
- A child logs into their own profile and only sees their own app, progress, and
  rewards.
- Keep child login simple: a profile pick plus a short PIN. Save real passwords
  for the parent account.

### Audio

Use the browser's built-in speech synthesis (Web Speech API). It's free and needs
no service. Handle the known iOS issues:

- Speech won't fire without a user gesture, so trigger the first utterance from a
  tap.
- Voices load asynchronously. Wait for the voices list before speaking, and
  re-check after voiceschanged.
- Pin a specific en-US voice when available, with a sensible fallback.
- Give the child a replay button (except during a scored test, where replays may
  be limited or counted).
- If a word's default pronunciation is wrong, allow a per-word override (a stored
  phonetic spelling the synthesizer reads correctly).

## The gamification and learning engine (shared concepts)

These ideas are shared, but the spelling app is the first place we build them.

### Three session modes

Every word moves through these as the child learns it.

- Learn (introduction). No penalty. The child meets the word, sees the
  definition, hears it, and practices. Wrong answers just mean try again. Any
  word missed here gets re-tested at the end of the session.
- Practice (most sessions). Duolingo-style stakes. A wrong answer costs points
  and may cost a life in that run, but it isn't the end of the world. Missed
  words come back later in the same session and in future sessions.
- Test (graded). One chance per item. A wrong answer is wrong and the test is
  scored. The parent sees the score and the per-word results. Limit or disable
  hints and replays here.

### Mastery score and spaced repetition

Every word carries a mastery score from 0 to 10, roughly "how many times in a
row, in effect, the child has gotten this right," weighted toward recent and
higher-stakes attempts.

- A word the child gets right every time, from introduction through the test,
  lands at 10. Reviewed rarely after that (every few months).
- A word the child keeps missing sits low and comes back often until it climbs to
  10.
- Example: right 3 out of 10 times means a low score and frequent review until it
  reaches 10 out of 10, then it drops to occasional review.

Build the review scheduler around this score. Lower score means shorter interval
and higher priority next session. Higher score means longer interval. Words the
child has missed before always get extra weight over words they've never missed.

Store every attempt (word, mode, correct or not, timestamp) so we can recompute
mastery and show the parent a real history.

### Rewards

Points (XP) for correct answers, more for harder words and test items. Streaks
for showing up daily and for runs of correct answers. Badges for milestones
(first 10 mastered words, a perfect test, a 7-day streak, mastering a full grade
level). Lives or hearts apply in Practice and Test modes, not in Learn mode.

## The spelling app (build this first)

### Placement quiz

A new child takes a 40-word placement quiz to set a starting level:

- 6 average 4th grade words
- 7 average 5th grade words
- 8 6th grade words
- 7 7th grade words
- 6 8th grade words
- 6 9th grade words

Score it by grade band, not just total correct. Find the level where the child
starts missing words. Set the starting level on a fine scale (half-levels, so a
child can sit at 6.5, not just 6 or 7). The placement quiz is one-time, run in
Test mode rules (one chance per word).

### How words get chosen

The app generates grade- and skill-appropriate words from a built-in word bank,
picking from the child's current level. The parent can also add their own words
(for example, the actual list from school that week).

Seed the word bank into Postgres once, rather than calling a paid generation
service at runtime. Each word in the bank carries: the word, grade level, a
kid-friendly definition, an example sentence, a syllable break (for hints), and
an optional pronunciation override for the speech synthesizer.

Generate the bank with help inside this project and load it into Postgres. When a
parent adds a custom word, fill in the definition and example by hand or with a
one-time generation pass, so custom words behave like bank words.

The parent sets how many new words the child gets per week. The app fills the
week from the child's current level, mixes in review words the scheduler is due
to surface, and folds in any parent-added words.

### Exercise types

Rotate these so sessions don't feel repetitive:

- Match the word to its definition.
- Hear the word and spell it (the core spelling exercise).
- Word jumble: unscramble the letters into the correct word.
- Missing letters: the child fills in the blanks.
- Hear it and type it in a sentence (use the example sentence).
- Pick the correctly spelled version from look-alikes.

Each word should appear in at least two different exercise types before it counts
as introduced.

### Adaptive leveling

Adjust the child's level based on recent performance, in half-level steps. Make
these thresholds easy to change in one place.

- At or above 90% on the current level across a recent window (last two sessions
  or the weekly test): move up half a level. Keep climbing as long as they keep
  it up.
- Below 80%: move down half a level.
- Between 80% and 90%: hold steady and keep practicing at the current level.

### Parent (teacher) view

From their own phone, a parent can:

- see each child's current level, streak, and points
- see the weekly word list and which words are mastered, in progress, or
  struggling
- see test scores and the per-word breakdown of each test
- set the weekly new-word count
- add custom words

## Brand

### Colors

- Main: #002d53 (dark navy)
- Secondary: #48b2e1 (light blue)
- Third: #eb3f32 (red)
- Accent: #e9b14f (gold)

### Logo and icons

Source file: `assets/logo-source.png` (three owls on an open book).
Square version: `assets/logo-square.png` (padded to square with transparent
background).

Generated icon sizes live in `assets/`:

- `icon-512x512.png`, `icon-384x384.png`, `icon-192x192.png` — PWA manifest
  icons
- `icon-180x180.png` — Apple touch icon
- `icon-152x152.png`, `icon-144x144.png`, `icon-128x128.png`, `icon-96x96.png`,
  `icon-72x72.png`, `icon-48x48.png` — legacy sizes
- `icon-32x32.png`, `icon-16x16.png` — small icons
- `favicon.ico` — multi-size favicon (16, 32, 48)

When referencing the logo in HTML, use the pre-generated files from `assets/`.

## Roadmap

1. Spelling app for the 10-year-old, on the shared platform.
2. Math app for the 10-year-old, reusing the platform.
3. Spanish app for the 15-year-old, at a level that matches a strong, experienced
   learner.
