# Spelling app: complete features list

Everything we've agreed to build, organized by Student mode and Teacher mode, then by priority inside each. Priority 1 is the foundation and the first thing to build next; Priority 3 is variety and polish. Word counts on each are kept short on purpose so this stays a working checklist.

## Already shipped (foundation)

- Hear it and spell it, the core exercise.
- Persistent XP and a day streak, stored in Postgres.
- Words served from the database, not hardcoded.
- Installable PWA, full-screen on iPhone, offline-tolerant for an in-progress session.
- Deployed on Railway, with auto-deploy on every push to GitHub.

---

## Student mode

### Priority 1: the learning engine

**Mastery score (0 to 10).** Every word the student touches carries a score from 0 to 10, roughly how many times in a row he has spelled it right, weighted toward recent and higher-stakes tries. Get it right from introduction through the test and it lands at 10. Keep missing it and it sits low. The score decides which exercise he sees and how often the word comes back.

**Spaced repetition scheduler.** The scheduler reads the mastery score to decide when a word returns. Low score means a short interval and high priority next session. High score means a long interval, down to once every few months at 10. Words he has missed before always get extra weight over words he has never missed, so weak spots resurface first.

**Adaptive leveling.** His level moves in half steps, so he can sit at 6.5, not just 6 or 7. Score 90 percent or higher across the last two sessions or the weekly test and he moves up half a level, and keeps climbing while he holds it. Drop below 80 percent and he moves down half a level. Between 80 and 90, he holds and keeps practicing. Keep the thresholds in one place to tune once you see real data.

**Session modes: Learn, Practice, Test.** Every word moves through three modes. Learn introduces it with no penalty, with definition and audio, and anything missed gets retested at the end. Practice carries Duolingo-style stakes, where a wrong answer costs points and maybe a life and missed words come back later. Test is graded, one chance per item, with hints and replays limited, and the score and per-word results go to you. A word counts as introduced once he has seen it in at least two exercise types.

**Placement pre-test.** A new student takes a one-time 40-word quiz to set his starting level, run under Test rules with one chance per word. The mix spans grades: 6 fourth-grade, 7 fifth, 8 sixth, 7 seventh, 6 eighth, 6 ninth. Score it by grade band, not raw total, to find where he starts missing words, and set the starting level on the half-level scale.

**Expanded word bank (grades 4 to 9).** You have 20 sixth-grade words. Placement and leveling need a real bank across grades 4 through 9. Each word stores the word, grade, a kid-friendly definition, an example sentence, a syllable break for hints, and an optional pronunciation override for the voice. Generate it once and seed it into Postgres, with the app column set to spelling so math and Spanish reuse the table later.

### Priority 2: core exercises and stakes

**Lives and hearts.** In Practice and Test, he has a small number of lives per run, and a wrong answer costs one. Run out and the run ends, with a quick recovery path so a rough patch is not punishing. Learn mode has no lives. This adds stakes without making practice feel like a final exam.

**Pick the correct spelling (five options).** The first time he meets a word, he hears it and picks the right spelling from five look-alikes, for example Communikate, Comunicate, Komunicate, Communacate, Communicate. Vary where the correct one sits each time. This is recognition, the easiest rung, so it belongs in Learn mode before he has to produce the word himself.

**Match word to definition.** Show five words on the left and five definitions on the right. He matches them. Get one right and that pair clears, a new word slides in, and the lists reshuffle so position is never a crutch. A wrong match stays put to try again. Good for Learn and Practice warm-ups, and it ties spelling to meaning.

**Missing letters.** Show the definition and the word with some letters blanked, and remove more each time he succeeds. COMMUNICATE might appear as CO_M_NI_ATE, then _OM_U__C_T_ on the next pass. Drive the blank count off the mastery score: low score shows a couple of blanks, high mastery shows almost none, until he is typing the word cold. This is the scaffold between recognition and full recall.

**Build the word from a letter tray.** Give the correct letters plus two or three decoys in a tray, and he taps them in order to assemble the word. It is lower stakes than typing on a keyboard and feels tactile on a phone. Good for Learn mode and for long words, since he chooses from known letters instead of producing every keystroke from scratch.

**Badges and milestones.** Award badges for milestones: first 10 words mastered, a perfect test, a 7-day streak, clearing a full grade level. They mark progress and give him something to chase beyond the XP counter. Keep the list easy to extend so you can add new ones as he hits them.

### Priority 3: variety and polish

**Word jumble.** Scramble the letters and he drags or types them into the right order, with the definition shown for context. A different muscle from spelling on a blank line, useful for variety in Practice so sessions do not feel like the same drill every day.

**Type it in a sentence.** Use the word's example sentence with the word blanked out. He hears the word, then types it into the sentence. This puts spelling in context and doubles as light reading, closer to how he meets these words in real writing.

**Speed round.** A 60-second sprint where he spells as many due words as he can for bonus XP. It adds arcade pull and gives him a reason to come back for another run after the daily set is done. Cap the stakes so it stays fun, not stressful.

**Proofreading.** Show a sentence with one misspelled word. He taps the wrong word and fixes it. This trains the real-world skill, catching your own errors in writing, which plain spelling drills miss. Pull the misspellings from his own past mistakes when you can.

**Syllable by syllable.** Hear the word, then spell it one syllable at a time using the syllable breaks already in the bank, so environment becomes en, vi, ron, ment. Long words stop feeling like a wall, and he learns the chunks that make them spellable.

**Lock it in.** Right after a correct hear-and-spell, ask him to spell the same word once more from memory, no audio and no hint. It is a cheap second repetition at the moment the word is freshest, and it helps the spelling stick instead of fading by tomorrow.

---

## Teacher mode

### Priority 1: accounts and the core dashboard

**Accounts and roles.** One parent account with a real password, and one or more child profiles under it. A child signs in by picking his profile and entering a short PIN, and only ever sees his own app, progress, and rewards. You see the dashboard; he never does. This also locks down the public URL so it is not wide open. Hash the PINs; do not store them in plain text.

**Progress dashboard.** From your own phone, see each child's current level, day streak, and points at a glance. See the week's word list with each word marked mastered, in progress, or struggling. See every test score with the per-word breakdown of what he got right and wrong. This is the core teacher view and the reason most of the data exists.

**Set the weekly new-word count.** You decide how many new words he gets each week. The week fills from his current level, mixes in review words the scheduler says are due, and folds in any words you added. One number, set per child, easy to dial up or down as he speeds up or struggles.

### Priority 2: managing content and tests

**Add and delete words.** Add your own words on top of the bank, like the actual list that came home from school, and delete ones you do not want. When you add a word, the definition, example, and syllable break get filled in automatically in a one-time pass so your words behave exactly like bank words. Removed words drop out of his rotation.

**Assign and configure tests.** Set up a graded test for the week and assign it. It runs under Test rules, one chance per item, hints and replays limited, with words from his current list. When he finishes, the score and per-word results land in your dashboard. Use it as the weekly checkpoint that feeds leveling.

**Trigger the placement pre-test.** For a new child, enter his grade and start the 40-word placement quiz from your side. The result sets his starting level on the half-level scale, so he begins where he actually is instead of a guess. Re-run it later if you think he has jumped ahead.

**Words to watch.** Pull the handful of words he keeps missing straight from the attempt log and surface them on the dashboard. You see his real weak spots without digging, and you can re-teach them or roll them into next week's list in a tap. This turns the raw attempt history into something you act on.

**Review and override a result.** When he is marked wrong on a typo, a homophone, or a fair answer the app did not expect, you can excuse or correct that item so his score and mastery reflect reality. The same screen lets you fix a word the voice mispronounces by setting its pronunciation override on the spot.

### Priority 3: motivation and scheduling

**Real-world reward control.** Define the payoffs that actually motivate him, for example a 7-day streak earns movie night. The milestone gets tracked, you get told when he hits it, and you mark it delivered. The in-app badges are nice, but this puts the rewards he cares about in your hands and keeps them honest.

**School-day calendar with streak protection.** Mark which days count toward his streak and pause it for trips, sick days, or vacation. A weekend or a week away should not wipe a streak he earned. You set the school-day rhythm once, and the streak respects it instead of demanding practice 365 days a year.
