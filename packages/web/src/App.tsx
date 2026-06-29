import { useCallback, useEffect, useRef, useState } from "react";
import { speak } from "./speech";
import {
  fetchPlacementStatus,
  fetchPlacementQuiz,
  scorePlacement,
  fetchSessionWords,
  fetchStats,
  fetchBadges,
  postAttempt,
  postSession,
  fetchPendingTest,
  completeAssignedTest,
  fetchPastMistakes,
  type WordFromApi,
  type Stats,
  type Badge,
  type PlacementScoreResult,
  type SessionResult,
  type PendingTest,
} from "./api";
import { PickSpelling } from "./PickSpelling";
import { MatchExercise } from "./MatchExercise";
import { MissingLetters } from "./MissingLetters";
import { LetterTray } from "./LetterTray";
import { WordJumble } from "./WordJumble";
import { SentenceFill } from "./SentenceFill";
import { Proofreading } from "./Proofreading";
import { SyllableSpell } from "./SyllableSpell";
import "./App.css";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
type Screen =
  | "loading"
  | "placement"
  | "placement-results"
  | "home"
  | "session"
  | "session-results"
  | "speed-round"
  | "speed-round-results";

type SessionMode = "learn" | "practice" | "test";

type SessionStage =
  | "match"
  | "pick_spelling"
  | "missing_letters"
  | "letter_tray"
  | "syllable_spell"
  | "word_jumble"
  | "sentence_fill"
  | "proofreading"
  | "hear_and_spell"
  | "out_of_lives";

interface WordResult {
  word: WordFromApi;
  correct: boolean;
  answerGiven: string;
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────
const LIVES_PRACTICE = 5;
const LIVES_TEST = 3;
const RECOVERY_LIVES = 2;
const TEST_MAX_REPLAYS = 1;

interface AppProps {
  onLogout: () => void;
}

export function App({ onLogout }: AppProps) {
  // ── Screen state ──
  const [screen, setScreen] = useState<Screen>("loading");
  const [stats, setStats] = useState<Stats>({
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActive: null,
  });
  const [currentLevel, setCurrentLevel] = useState(6.0);

  // ── Placement ──
  const [placementWords, setPlacementWords] = useState<WordFromApi[]>([]);
  const [placementResults, setPlacementResults] =
    useState<PlacementScoreResult | null>(null);

  // ── Assigned test ──
  const [pendingTest, setPendingTest] = useState<PendingTest | null>(null);
  const [currentAssignedTestId, setCurrentAssignedTestId] = useState<number | null>(null);

  // ── Session ──
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [sessionStage, setSessionStage] = useState<SessionStage>("hear_and_spell");
  const [sessionWords, setSessionWords] = useState<WordFromApi[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [correct, setCorrect] = useState(false);
  const [pointsFlash, setPointsFlash] = useState<number | null>(null);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  // Learn mode
  const [learnRetestQueue, setLearnRetestQueue] = useState<WordFromApi[]>([]);
  const [inRetest, setInRetest] = useState(false);

  // Practice mode
  const [practiceMissedQueue, setPracticeMissedQueue] = useState<WordFromApi[]>([]);

  // Test mode replay limit
  const [testReplaysUsed, setTestReplaysUsed] = useState(0);

  // Lives
  const [lives, setLives] = useState(LIVES_PRACTICE);
  const [livesMax, setLivesMax] = useState(LIVES_PRACTICE);
  const [livesRecovered, setLivesRecovered] = useState(false);

  // Pick spelling stage index
  const [pickSpellingIndex, setPickSpellingIndex] = useState(0);

  // Missing letters stage index
  const [missingLettersIndex, setMissingLettersIndex] = useState(0);

  // Letter tray stage index
  const [letterTrayIndex, setLetterTrayIndex] = useState(0);

  // Word jumble stage index
  const [wordJumbleIndex, setWordJumbleIndex] = useState(0);

  // Sentence fill stage index
  const [sentenceFillIndex, setSentenceFillIndex] = useState(0);

  // Syllable spell stage index
  const [syllableSpellIndex, setSyllableSpellIndex] = useState(0);

  // Proofreading stage index
  const [proofreadingIndex, setProofreadingIndex] = useState(0);

  // Past mistakes map for proofreading
  const [pastMistakesMap, setPastMistakesMap] = useState<Record<number, string[]>>({});

  // Lock it in
  const [lockItInActive, setLockItInActive] = useState(false);
  const [lockItInWordId, setLockItInWordId] = useState<number | null>(null);

  // Speed round state
  const [speedTimer, setSpeedTimer] = useState(60);
  const [speedWords, setSpeedWords] = useState<WordFromApi[]>([]);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [speedCorrect, setSpeedCorrect] = useState(0);
  const [speedTotal, setSpeedTotal] = useState(0);
  const [speedInput, setSpeedInput] = useState("");
  const [speedPhase, setSpeedPhase] = useState<"ready" | "answered">("ready");

  // Badges
  const [badges, setBadges] = useState<Badge[]>([]);
  const [newBadgeFlash, setNewBadgeFlash] = useState<{
    name: string;
    icon: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Bootstrap ──
  useEffect(() => {
    async function boot() {
      try {
        const [placement, s, b] = await Promise.all([
          fetchPlacementStatus(),
          fetchStats(),
          fetchBadges(),
        ]);
        setStats(s);
        setBadges(b);
        setCurrentLevel(placement.currentLevel);

        if (!placement.taken) {
          const quiz = await fetchPlacementQuiz();
          setPlacementWords(quiz.words);
          setWordIndex(0);
          setWordResults([]);
          setInput("");
          setPhase("ready");
          setScreen("placement");
        } else {
          // Check for assigned test
          try {
            const pt = await fetchPendingTest();
            setPendingTest(pt);
          } catch {
            // Ignore — no pending test
          }
          setScreen("home");
        }
      } catch (err) {
        console.error("Boot failed:", err);
        setScreen("home");
      }
    }
    boot();
  }, []);

  // Current word for placement or exercise stages
  const currentWord =
    screen === "placement"
      ? placementWords[wordIndex] ?? null
      : sessionStage === "pick_spelling"
        ? sessionWords[pickSpellingIndex] ?? null
        : sessionStage === "missing_letters"
          ? sessionWords[missingLettersIndex] ?? null
          : sessionStage === "letter_tray"
            ? sessionWords[letterTrayIndex] ?? null
            : sessionStage === "syllable_spell"
              ? sessionWords[syllableSpellIndex] ?? null
              : sessionStage === "word_jumble"
                ? sessionWords[wordJumbleIndex] ?? null
                : sessionStage === "sentence_fill"
                  ? sessionWords[sentenceFillIndex] ?? null
                  : sessionStage === "proofreading"
                    ? sessionWords[proofreadingIndex] ?? null
                    : sessionWords[wordIndex] ?? null;

  // Focus input when word changes (hear_and_spell / placement)
  useEffect(() => {
    if (!currentWord) return;
    if (sessionStage !== "hear_and_spell" && screen !== "placement") return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [currentWord, wordIndex, sessionStage, screen]);

  // ── Shared helpers ──
  const hearWord = useCallback(() => {
    if (!currentWord) return;
    if (screen === "session" && sessionMode === "test") {
      if (testReplaysUsed >= TEST_MAX_REPLAYS && phase === "ready") return;
      if (phase === "ready") setTestReplaysUsed((n) => n + 1);
    }
    const text =
      currentWord.pronunciationOverride ??
      currentWord.pronunciation_override ??
      currentWord.word;
    speak(text);
  }, [currentWord, screen, sessionMode, testReplaysUsed, phase]);

  // ── Start a session ──
  const startSession = useCallback(async (mode: SessionMode, wordLimit?: number, assignedTestId?: number) => {
    try {
      const data = await fetchSessionWords(mode, wordLimit ?? 10);
      setCurrentAssignedTestId(assignedTestId ?? null);
      setSessionMode(mode);
      setSessionWords(data.words);
      setCurrentLevel(data.currentLevel);
      setWordIndex(0);
      setInput("");
      setPhase("ready");
      setWordResults([]);
      setLearnRetestQueue([]);
      setInRetest(false);
      setPracticeMissedQueue([]);
      setTestReplaysUsed(0);
      setPickSpellingIndex(0);
      setMissingLettersIndex(0);
      setLetterTrayIndex(0);
      setWordJumbleIndex(0);
      setSentenceFillIndex(0);
      setSyllableSpellIndex(0);
      setProofreadingIndex(0);
      setLockItInActive(false);
      setLockItInWordId(null);
      setSessionResult(null);

      // Fetch past mistakes for proofreading (practice mode)
      if (mode === "practice" && data.words.length > 0) {
        fetchPastMistakes(data.words.map((w) => w.id))
          .then(setPastMistakesMap)
          .catch(() => setPastMistakesMap({}));
      } else {
        setPastMistakesMap({});
      }

      // Set lives and initial stage based on mode
      if (mode === "learn") {
        setLives(Infinity);
        setLivesMax(0); // no hearts display
        setSessionStage(data.words.length > 0 ? "match" : "hear_and_spell");
      } else if (mode === "practice") {
        setLives(LIVES_PRACTICE);
        setLivesMax(LIVES_PRACTICE);
        setSessionStage(data.words.length > 0 ? "match" : "hear_and_spell");
      } else {
        setLives(LIVES_TEST);
        setLivesMax(LIVES_TEST);
        setSessionStage("hear_and_spell");
      }
      setLivesRecovered(false);
      setScreen("session");
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }, []);

  // ── Match exercise complete ──
  const handleMatchComplete = useCallback(() => {
    if (sessionMode === "learn") {
      setSessionStage("pick_spelling");
      setPickSpellingIndex(0);
    } else {
      // Practice mode: match → word_jumble
      setSessionStage("word_jumble");
      setWordJumbleIndex(0);
    }
  }, [sessionMode]);

  // ── Pick spelling complete for one word ──
  const handlePickComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const pickWord = sessionWords[pickSpellingIndex];
      if (!pickWord) return;

      try {
        await postAttempt({
          wordId: pickWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "pick_correct_spelling",
          mode: "learn",
        });
        const newStats = await fetchStats();
        setStats(newStats);
      } catch (err) {
        console.error("Failed to record pick attempt:", err);
      }

      const nextIdx = pickSpellingIndex + 1;
      if (nextIdx < sessionWords.length) {
        setPickSpellingIndex(nextIdx);
      } else {
        // All pick-spelling done, move to missing_letters
        setSessionStage("missing_letters");
        setMissingLettersIndex(0);
      }
    },
    [pickSpellingIndex, sessionWords],
  );

  // ── Badge flash helper ──
  const flashBadge = useCallback(
    (badge: { name: string; icon: string }) => {
      setNewBadgeFlash(badge);
      setTimeout(() => setNewBadgeFlash(null), 3000);
      // Refresh badge list
      fetchBadges().then(setBadges).catch(console.error);
    },
    [],
  );

  // ── Missing letters complete for one word ──
  const handleMissingLettersComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const mlWord = sessionWords[missingLettersIndex];
      if (!mlWord) return;

      try {
        const result = await postAttempt({
          wordId: mlWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "missing_letters",
          mode: "learn",
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record missing letters attempt:", err);
      }

      const nextIdx = missingLettersIndex + 1;
      if (nextIdx < sessionWords.length) {
        setMissingLettersIndex(nextIdx);
      } else {
        // All missing-letters done, move to letter_tray
        setSessionStage("letter_tray");
        setLetterTrayIndex(0);
      }
    },
    [missingLettersIndex, sessionWords, flashBadge],
  );

  // ── Letter tray complete for one word ──
  const handleLetterTrayComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const ltWord = sessionWords[letterTrayIndex];
      if (!ltWord) return;

      try {
        const result = await postAttempt({
          wordId: ltWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "letter_tray",
          mode: "learn",
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record letter tray attempt:", err);
      }

      const nextIdx = letterTrayIndex + 1;
      if (nextIdx < sessionWords.length) {
        setLetterTrayIndex(nextIdx);
      } else {
        // All letter-tray done, move to syllable_spell
        setSessionStage("syllable_spell");
        setSyllableSpellIndex(0);
      }
    },
    [letterTrayIndex, sessionWords, flashBadge],
  );

  // ── Word jumble complete for one word ──
  const handleWordJumbleComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const wjWord = sessionWords[wordJumbleIndex];
      if (!wjWord) return;

      try {
        const result = await postAttempt({
          wordId: wjWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "word_jumble",
          mode: sessionMode,
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record word jumble attempt:", err);
      }

      const nextIdx = wordJumbleIndex + 1;
      if (nextIdx < sessionWords.length) {
        setWordJumbleIndex(nextIdx);
      } else {
        // All word-jumble done, move to sentence_fill
        setSessionStage("sentence_fill");
        setSentenceFillIndex(0);
      }
    },
    [wordJumbleIndex, sessionWords, sessionMode, flashBadge],
  );

  // ── Sentence fill complete for one word ──
  const handleSentenceFillComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const sfWord = sessionWords[sentenceFillIndex];
      if (!sfWord) return;

      try {
        const result = await postAttempt({
          wordId: sfWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "sentence_fill",
          mode: sessionMode,
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record sentence fill attempt:", err);
      }

      const nextIdx = sentenceFillIndex + 1;
      if (nextIdx < sessionWords.length) {
        setSentenceFillIndex(nextIdx);
      } else {
        // All sentence-fill done, move to proofreading
        setSessionStage("proofreading");
        setProofreadingIndex(0);
      }
    },
    [sentenceFillIndex, sessionWords, sessionMode, flashBadge],
  );

  // ── Syllable spell complete for one word ──
  const handleSyllableSpellComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const ssWord = sessionWords[syllableSpellIndex];
      if (!ssWord) return;

      try {
        const result = await postAttempt({
          wordId: ssWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "syllable_spell",
          mode: "learn",
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record syllable spell attempt:", err);
      }

      const nextIdx = syllableSpellIndex + 1;
      if (nextIdx < sessionWords.length) {
        setSyllableSpellIndex(nextIdx);
      } else {
        // All syllable-spell done, move to hear_and_spell
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
      }
    },
    [syllableSpellIndex, sessionWords, flashBadge],
  );

  // ── Proofreading complete for one word ──
  const handleProofreadingComplete = useCallback(
    async (isCorrect: boolean, answerGiven: string) => {
      const prWord = sessionWords[proofreadingIndex];
      if (!prWord) return;

      try {
        const result = await postAttempt({
          wordId: prWord.id,
          correct: isCorrect,
          answerGiven,
          exerciseType: "proofreading",
          mode: sessionMode,
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record proofreading attempt:", err);
      }

      const nextIdx = proofreadingIndex + 1;
      if (nextIdx < sessionWords.length) {
        setProofreadingIndex(nextIdx);
      } else {
        // All proofreading done, move to hear_and_spell
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
      }
    },
    [proofreadingIndex, sessionWords, sessionMode, flashBadge],
  );

  // ── Placement quiz ──
  const handlePlacementAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");
    setWordResults((prev) => [
      ...prev,
      { word: currentWord, correct: isCorrect, answerGiven: input.trim() },
    ]);
  }, [input, currentWord]);

  const nextPlacementWord = useCallback(async () => {
    const nextIdx = wordIndex + 1;
    if (nextIdx < placementWords.length) {
      setWordIndex(nextIdx);
      setInput("");
      setPhase("ready");
    } else {
      try {
        const results = wordResults.map((r) => ({
          wordId: r.word.id,
          grade: r.word.grade,
          correct: r.correct,
        }));
        const lastWord = placementWords[wordIndex];
        if (lastWord && !results.find((r) => r.wordId === lastWord.id)) {
          results.push({
            wordId: lastWord.id,
            grade: lastWord.grade,
            correct: correct,
          });
        }
        const scoreResult = await scorePlacement(results);
        setPlacementResults(scoreResult);
        setCurrentLevel(scoreResult.placementLevel);
        setScreen("placement-results");
      } catch (err) {
        console.error("Failed to score placement:", err);
      }
    }
  }, [wordIndex, placementWords, wordResults, correct]);

  // ── Session: check answer (hear_and_spell) ──
  const checkAnswer = useCallback(async () => {
    if (!input.trim() || !currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");

    if (lockItInActive) {
      // Lock-it-in mode: record attempt but no penalties, no queuing, no scoring
      try {
        const result = await postAttempt({
          wordId: currentWord.id,
          correct: isCorrect,
          answerGiven: input.trim(),
          exerciseType: "lock_it_in",
          mode: sessionMode,
        });
        const newStats = await fetchStats();
        setStats(newStats);
        if (result.pointsAwarded > 0) {
          setPointsFlash(result.pointsAwarded);
          setTimeout(() => setPointsFlash(null), 1200);
        }
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }
      } catch (err) {
        console.error("Failed to record lock-it-in attempt:", err);
      }
      // Don't track in wordResults, don't deduct lives, don't queue
      return;
    }

    // Learn mode: queue missed for retest
    if (sessionMode === "learn" && !isCorrect && !inRetest) {
      setLearnRetestQueue((prev) => {
        if (prev.find((w) => w.id === currentWord.id)) return prev;
        return [...prev, currentWord];
      });
    }

    // Practice mode: queue missed to cycle back
    if (sessionMode === "practice" && !isCorrect) {
      setPracticeMissedQueue((prev) => {
        if (prev.find((w) => w.id === currentWord.id)) return prev;
        return [...prev, currentWord];
      });
    }

    // Deduct a life on wrong answer in Practice/Test
    if (!isCorrect && sessionMode !== "learn") {
      setLives((prev) => prev - 1);
    }

    // Record attempt
    try {
      const result = await postAttempt({
        wordId: currentWord.id,
        correct: isCorrect,
        answerGiven: input.trim(),
        exerciseType: "hear_and_spell",
        mode: sessionMode,
      });
      const newStats = await fetchStats();
      setStats(newStats);
      if (result.pointsAwarded > 0) {
        setPointsFlash(result.pointsAwarded);
        setTimeout(() => setPointsFlash(null), 1200);
      }
      if (result.newBadges && result.newBadges.length > 0) {
        flashBadge(result.newBadges[0]);
      }
    } catch (err) {
      console.error("Failed to record attempt:", err);
    }

    // Track result (only hear_and_spell feeds session scoring)
    setWordResults((prev) => [
      ...prev,
      { word: currentWord, correct: isCorrect, answerGiven: input.trim() },
    ]);
  }, [input, currentWord, sessionMode, inRetest, lockItInActive]);

  // ── Finish session helper ──
  const finishSession = useCallback(async () => {
    try {
      const totalWords = wordResults.length;
      const correctCount = wordResults.filter((r) => r.correct).length;
      if (totalWords > 0) {
        const result = await postSession({
          mode: sessionMode,
          totalWords,
          correctCount,
        });
        setSessionResult(result);
        setCurrentLevel(result.levelAfter);
        if (result.newBadges && result.newBadges.length > 0) {
          flashBadge(result.newBadges[0]);
        }

        // If this was an assigned test, mark it complete
        if (currentAssignedTestId && result.sessionId) {
          try {
            await completeAssignedTest(currentAssignedTestId, result.sessionId);
            setPendingTest(null);
            setCurrentAssignedTestId(null);
          } catch (err) {
            console.error("Failed to complete assigned test:", err);
          }
        }
      }
    } catch (err) {
      console.error("Failed to record session:", err);
    }
    setScreen("session-results");
  }, [wordResults, sessionMode, flashBadge, currentAssignedTestId]);

  // ── Speed round ──
  const speedTimerRef = useRef(60);
  const speedRoundActiveRef = useRef(false);

  const finishSpeedRound = useCallback(async () => {
    speedRoundActiveRef.current = false;
    try {
      if (speedTotal > 0) {
        await postSession({
          mode: "practice",
          totalWords: speedTotal,
          correctCount: speedCorrect,
        });
      }
      const newStats = await fetchStats();
      setStats(newStats);
    } catch (err) {
      console.error("Failed to record speed round session:", err);
    }
    setScreen("speed-round-results");
  }, [speedTotal, speedCorrect]);

  const startSpeedRound = useCallback(async () => {
    try {
      const data = await fetchSessionWords("practice", 30);
      setSpeedWords(data.words);
      setSpeedIndex(0);
      setSpeedCorrect(0);
      setSpeedTotal(0);
      setSpeedTimer(60);
      speedTimerRef.current = 60;
      setSpeedInput("");
      setSpeedPhase("ready");
      speedRoundActiveRef.current = true;
      setScreen("speed-round");
    } catch (err) {
      console.error("Failed to start speed round:", err);
    }
  }, []);

  // Speed round timer
  useEffect(() => {
    if (screen !== "speed-round") return;
    const interval = setInterval(() => {
      speedTimerRef.current -= 1;
      setSpeedTimer(speedTimerRef.current);
      if (speedTimerRef.current <= 0) {
        clearInterval(interval);
        speedRoundActiveRef.current = false;
        // Use a timeout to let the last state settle
        setTimeout(() => finishSpeedRound(), 50);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, finishSpeedRound]);

  const speedCurrentWord = speedWords[speedIndex % speedWords.length] ?? null;

  const hearSpeedWord = useCallback(() => {
    if (!speedCurrentWord) return;
    const text =
      speedCurrentWord.pronunciationOverride ??
      speedCurrentWord.pronunciation_override ??
      speedCurrentWord.word;
    speak(text);
  }, [speedCurrentWord]);

  const checkSpeedAnswer = useCallback(async () => {
    if (!speedInput.trim() || !speedCurrentWord || !speedRoundActiveRef.current) return;
    const isCorrect =
      speedInput.trim().toLowerCase() === speedCurrentWord.word.toLowerCase();
    setSpeedPhase("answered");

    // Record attempt
    try {
      await postAttempt({
        wordId: speedCurrentWord.id,
        correct: isCorrect,
        answerGiven: speedInput.trim(),
        exerciseType: "speed_round",
        mode: "practice",
      });
    } catch (err) {
      console.error("Failed to record speed attempt:", err);
    }

    setSpeedTotal((prev) => prev + 1);
    if (isCorrect) {
      setSpeedCorrect((prev) => prev + 1);
      // Auto-advance quickly on correct
      setTimeout(() => {
        if (!speedRoundActiveRef.current) return;
        setSpeedIndex((prev) => prev + 1);
        setSpeedInput("");
        setSpeedPhase("ready");
      }, 300);
    } else {
      // Show correct answer briefly, then advance
      setTimeout(() => {
        if (!speedRoundActiveRef.current) return;
        setSpeedIndex((prev) => prev + 1);
        setSpeedInput("");
        setSpeedPhase("ready");
      }, 1200);
    }
  }, [speedInput, speedCurrentWord]);

  const handleSpeedKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && speedPhase === "ready") {
        checkSpeedAnswer();
      }
    },
    [speedPhase, checkSpeedAnswer],
  );

  // ── Next word (hear_and_spell) ──
  const nextWord = useCallback(async () => {
    // If we just finished a lock-it-in rep, clear the flag and advance normally
    if (lockItInActive) {
      setLockItInActive(false);
      setLockItInWordId(null);
      // Fall through to normal advancement below
    } else if (
      // Trigger lock-it-in: correct hear_and_spell in learn/practice (not test, not already locking)
      correct &&
      phase === "answered" &&
      sessionMode !== "test" &&
      !lockItInActive
    ) {
      setLockItInActive(true);
      setLockItInWordId(currentWord?.id ?? null);
      setInput("");
      setPhase("ready");
      return;
    }

    // Learn mode: wrong answer = try again
    if (sessionMode === "learn" && !correct && phase === "answered") {
      setInput("");
      setPhase("ready");
      return;
    }

    // Check for out-of-lives before advancing
    if (lives <= 0 && sessionMode !== "learn") {
      // Record session so far
      try {
        const totalWords = wordResults.length;
        const correctCount = wordResults.filter((r) => r.correct).length;
        if (totalWords > 0) {
          const result = await postSession({
            mode: sessionMode,
            totalWords,
            correctCount,
          });
          setSessionResult(result);
          setCurrentLevel(result.levelAfter);
        }
      } catch (err) {
        console.error("Failed to record session:", err);
      }
      setSessionStage("out_of_lives");
      return;
    }

    const nextIdx = wordIndex + 1;

    if (nextIdx < sessionWords.length) {
      setWordIndex(nextIdx);
      setInput("");
      setPhase("ready");
      setTestReplaysUsed(0);
    } else {
      // End of word list

      // Learn mode: retest missed
      if (sessionMode === "learn" && !inRetest && learnRetestQueue.length > 0) {
        setSessionWords(learnRetestQueue);
        setLearnRetestQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        setInRetest(true);
        return;
      }

      // Practice mode: cycle missed words
      if (sessionMode === "practice" && practiceMissedQueue.length > 0) {
        setSessionWords(practiceMissedQueue);
        setPracticeMissedQueue([]);
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return;
      }

      // Session complete
      await finishSession();
    }
  }, [
    wordIndex,
    sessionWords,
    sessionMode,
    correct,
    phase,
    inRetest,
    learnRetestQueue,
    practiceMissedQueue,
    lives,
    wordResults,
    finishSession,
    lockItInActive,
    currentWord,
  ]);

  // ── Recovery from out-of-lives ──
  const handleRecovery = useCallback(() => {
    setLives(RECOVERY_LIVES);
    setLivesRecovered(true);
    setSessionStage("hear_and_spell");
    setInput("");
    setPhase("ready");
  }, []);

  // ── Keyboard handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "ready") {
          if (screen === "placement") handlePlacementAnswer();
          else checkAnswer();
        } else {
          if (screen === "placement") nextPlacementWord();
          else nextWord();
        }
      }
    },
    [phase, screen, handlePlacementAnswer, checkAnswer, nextPlacementWord, nextWord],
  );

  // ── Shared header ──
  const header = (
    <header className="header">
      <img src="/logo-square.png" alt="Family Spelling" className="logo" />
      <h1 className="title">Spelling</h1>
    </header>
  );

  // ── Hearts display ──
  const heartsDisplay =
    sessionMode !== "learn" && livesMax > 0 ? (
      <div className="hearts">
        {Array.from({ length: livesMax }).map((_, i) => (
          <span
            key={i}
            className={`heart ${i < lives ? "heart-full" : "heart-empty"}`}
          >
            &#9829;
          </span>
        ))}
      </div>
    ) : null;

  // ────────────────────────────────────────
  // LOADING
  // ────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className="app">
        {header}
        <p className="loading">Loading...</p>
      </div>
    );
  }

  // ────────────────────────────────────────
  // PLACEMENT QUIZ
  // ────────────────────────────────────────
  if (screen === "placement") {
    const progress = placementWords.length
      ? `${wordIndex + 1} / ${placementWords.length}`
      : "";

    return (
      <div className="app">
        {header}
        <div className="placement-banner">
          <p className="placement-title">Placement Quiz</p>
          <p className="placement-sub">
            Let's find your starting level. One chance per word.
          </p>
        </div>

        <main className="card">
          <p className="word-progress">{progress}</p>

          {currentWord && (
            <>
              <button className="btn btn-hear" onClick={hearWord} type="button">
                <span className="btn-icon">&#x1f50a;</span> Hear the word
              </button>

              <input
                ref={inputRef}
                className="spelling-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type the spelling..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={phase === "answered"}
                data-gramm="false"
              />

              {phase === "ready" && (
                <button
                  className="btn btn-check"
                  onClick={handlePlacementAnswer}
                  disabled={!input.trim()}
                  type="button"
                >
                  Check
                </button>
              )}

              {phase === "answered" && (
                <div className="result">
                  <button
                    className="btn btn-next"
                    onClick={nextPlacementWord}
                    type="button"
                  >
                    {wordIndex + 1 < placementWords.length
                      ? "Next word"
                      : "See results"}
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        <button className="btn-link teacher-link" onClick={onLogout} type="button">
          Sign out
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────
  // PLACEMENT RESULTS
  // ────────────────────────────────────────
  if (screen === "placement-results" && placementResults) {
    return (
      <div className="app">
        {header}
        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            Placement Complete
          </p>
          <p className="placement-level-result">
            Your starting level:{" "}
            <strong>{placementResults.placementLevel}</strong>
          </p>
          <p className="placement-accuracy">
            {placementResults.totalCorrect} / {placementResults.totalWords}{" "}
            correct ({placementResults.overallAccuracy}%)
          </p>

          <div className="band-scores">
            {placementResults.bandScores.map((band) => (
              <div key={band.grade} className="band-row">
                <span className="band-label">Grade {band.grade}</span>
                <span className="band-value">
                  {band.correct}/{band.total} ({band.accuracy}%)
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn btn-check"
            onClick={() => setScreen("home")}
            type="button"
          >
            Start practicing
          </button>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // HOME / MODE PICKER
  // ────────────────────────────────────────
  if (screen === "home") {
    return (
      <div className="app">
        {header}

        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.totalPoints}</span>
            <span className="stat-label">XP</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.currentStreak}</span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{currentLevel}</span>
            <span className="stat-label">level</span>
          </div>
        </div>

        {/* Assigned test banner */}
        {pendingTest && (
          <div className="assigned-test-banner">
            <p className="assigned-test-banner-text">
              Your teacher assigned a test!
            </p>
            <button
              className="btn btn-test"
              onClick={() => startSession("test", pendingTest.wordCount, pendingTest.id)}
              type="button"
            >
              Take the test ({pendingTest.wordCount} words)
            </button>
          </div>
        )}

        <main className="card">
          <p className="mode-heading">Choose a mode</p>

          <button
            className="btn btn-learn"
            onClick={() => startSession("learn")}
            type="button"
          >
            Learn new words
          </button>
          <p className="mode-desc">
            Meet new words with definitions and audio. No penalty for mistakes.
          </p>

          <button
            className="btn btn-practice"
            onClick={() => startSession("practice")}
            type="button"
          >
            Practice
          </button>
          <p className="mode-desc">
            Review words you've learned. Wrong answers cost points and lives.
          </p>

          <button
            className="btn btn-test"
            onClick={() => startSession("test")}
            type="button"
          >
            Test
          </button>
          <p className="mode-desc">
            Graded quiz. One chance per word, limited replays.
          </p>

          <button
            className="btn btn-speed"
            onClick={startSpeedRound}
            type="button"
          >
            Speed Round
          </button>
          <p className="mode-desc">
            60-second sprint. Spell as many words as you can for bonus XP.
          </p>
        </main>

        {badges.length > 0 && (
          <div className="badges-section">
            <p className="badges-heading">Badges</p>
            <div className="badges-grid">
              {badges.map((b) => (
                <div key={b.id} className="badge-card">
                  <span className={`badge-icon badge-icon-${b.icon}`} />
                  <span className="badge-name">{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn-link teacher-link" onClick={onLogout} type="button">
          Sign out
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────
  // SESSION
  // ────────────────────────────────────────
  if (screen === "session") {
    const modeBadge =
      sessionMode === "learn"
        ? "Learn"
        : sessionMode === "practice"
          ? "Practice"
          : "Test";

    // ── MATCH STAGE ──
    if (sessionStage === "match") {
      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="stage-label">Match words to definitions</span>
            </div>
            <MatchExercise
              words={sessionWords}
              mode={sessionMode as "learn" | "practice"}
              onComplete={handleMatchComplete}
              onStatsUpdate={setStats}
            />
          </main>
        </div>
      );
    }

    // ── PICK SPELLING STAGE ──
    if (sessionStage === "pick_spelling") {
      const pickWord = sessionWords[pickSpellingIndex];
      if (!pickWord) {
        // Shouldn't happen, but gracefully advance
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {pickSpellingIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Pick the correct spelling</p>
            <PickSpelling
              word={pickWord}
              onComplete={handlePickComplete}
            />
          </main>
        </div>
      );
    }

    // ── MISSING LETTERS STAGE ──
    if (sessionStage === "missing_letters") {
      const mlWord = sessionWords[missingLettersIndex];
      if (!mlWord) {
        setSessionStage("letter_tray");
        setLetterTrayIndex(0);
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {missingLettersIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Fill in the missing letters</p>
            <MissingLetters
              word={mlWord}
              masteryScore={mlWord.masteryScore ?? 0}
              onComplete={handleMissingLettersComplete}
            />
          </main>
        </div>
      );
    }

    // ── LETTER TRAY STAGE ──
    if (sessionStage === "letter_tray") {
      const ltWord = sessionWords[letterTrayIndex];
      if (!ltWord) {
        setSessionStage("syllable_spell");
        setSyllableSpellIndex(0);
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {letterTrayIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Build the word from letters</p>
            <LetterTray
              word={ltWord}
              onComplete={handleLetterTrayComplete}
            />
          </main>
        </div>
      );
    }

    // ── SYLLABLE SPELL STAGE ──
    if (sessionStage === "syllable_spell") {
      const ssWord = sessionWords[syllableSpellIndex];
      if (!ssWord) {
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {syllableSpellIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Spell it syllable by syllable</p>
            <SyllableSpell
              word={ssWord}
              onComplete={handleSyllableSpellComplete}
            />
          </main>
        </div>
      );
    }

    // ── WORD JUMBLE STAGE ──
    if (sessionStage === "word_jumble") {
      const wjWord = sessionWords[wordJumbleIndex];
      if (!wjWord) {
        setSessionStage("sentence_fill");
        setSentenceFillIndex(0);
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
            {heartsDisplay}
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {wordJumbleIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Unscramble the letters</p>
            <WordJumble
              word={wjWord}
              onComplete={handleWordJumbleComplete}
            />
          </main>
        </div>
      );
    }

    // ── SENTENCE FILL STAGE ──
    if (sessionStage === "sentence_fill") {
      const sfWord = sessionWords[sentenceFillIndex];
      if (!sfWord) {
        setSessionStage("proofreading");
        setProofreadingIndex(0);
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
            {heartsDisplay}
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {sentenceFillIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Type the word in the sentence</p>
            <SentenceFill
              word={sfWord}
              onComplete={handleSentenceFillComplete}
            />
          </main>
        </div>
      );
    }

    // ── PROOFREADING STAGE ──
    if (sessionStage === "proofreading") {
      const prWord = sessionWords[proofreadingIndex];
      if (!prWord) {
        setSessionStage("hear_and_spell");
        setWordIndex(0);
        setInput("");
        setPhase("ready");
        return null;
      }

      return (
        <div className="app">
          {header}
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.totalPoints}</span>
              <span className="stat-label">XP</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.currentStreak}</span>
              <span className="stat-label">day streak</span>
            </div>
            {heartsDisplay}
          </div>
          {newBadgeFlash && (
            <div className="badge-flash">
              <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
              <span className="badge-flash-text">{newBadgeFlash.name}</span>
            </div>
          )}
          <main className="card">
            <div className="session-header">
              <span className={`mode-badge mode-${sessionMode}`}>
                {modeBadge}
              </span>
              <span className="word-progress">
                {proofreadingIndex + 1} / {sessionWords.length}
              </span>
            </div>
            <p className="stage-label">Find and fix the misspelling</p>
            <Proofreading
              word={prWord}
              pastMistakes={pastMistakesMap[prWord.id]}
              onComplete={handleProofreadingComplete}
            />
          </main>
        </div>
      );
    }

    // ── OUT OF LIVES ──
    if (sessionStage === "out_of_lives") {
      const totalWords = wordResults.length;
      const correctCount = wordResults.filter((r) => r.correct).length;

      return (
        <div className="app">
          {header}
          <main className="card">
            <p className="out-of-lives-heading">Out of lives!</p>
            <div className="session-score">
              <span className="score-detail">
                {correctCount} / {totalWords} correct so far
              </span>
            </div>
            {!livesRecovered && (
              <button
                className="btn btn-learn"
                onClick={handleRecovery}
                type="button"
              >
                Continue (+{RECOVERY_LIVES} lives)
              </button>
            )}
            <button
              className="btn btn-next"
              onClick={() => setScreen("session-results")}
              type="button"
            >
              End session
            </button>
          </main>
        </div>
      );
    }

    // ── HEAR AND SPELL STAGE ──
    if (!currentWord) {
      return (
        <div className="app">
          {header}
          <p className="loading">No words available for this session.</p>
          <button
            className="btn btn-check"
            style={{ maxWidth: 400, marginTop: 16 }}
            onClick={() => setScreen("home")}
            type="button"
          >
            Back to home
          </button>
        </div>
      );
    }

    const progress = `${wordIndex + 1} / ${sessionWords.length}`;
    const showDefinition = sessionMode !== "test" && !lockItInActive;
    const canReplay =
      sessionMode !== "test" ||
      testReplaysUsed < TEST_MAX_REPLAYS ||
      phase === "answered";

    return (
      <div className="app">
        {header}

        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.totalPoints}</span>
            <span className="stat-label">XP</span>
            {pointsFlash !== null && (
              <span className="points-flash">+{pointsFlash}</span>
            )}
          </div>
          <div className="stat">
            <span className="stat-value">{stats.currentStreak}</span>
            <span className="stat-label">day streak</span>
          </div>
          {heartsDisplay}
        </div>

        {newBadgeFlash && (
          <div className="badge-flash">
            <span className={`badge-flash-icon badge-icon-${newBadgeFlash.icon}`} />
            <span className="badge-flash-text">{newBadgeFlash.name}</span>
          </div>
        )}

        <main className="card">
          <div className="session-header">
            <span className={`mode-badge mode-${sessionMode}`}>
              {modeBadge}
            </span>
            <span className="word-progress">{progress}</span>
            {inRetest && <span className="retest-badge">Retest</span>}
          </div>

          {lockItInActive && (
            <p className="lock-label">Lock it in! Spell it again from memory.</p>
          )}

          {showDefinition && (
            <p className="definition">{currentWord.definition}</p>
          )}

          {!lockItInActive && (
            <button
              className="btn btn-hear"
              onClick={hearWord}
              type="button"
              disabled={!canReplay}
            >
              <span className="btn-icon">&#x1f50a;</span>
              {sessionMode === "test" && phase === "ready"
                ? `Hear the word (${TEST_MAX_REPLAYS - testReplaysUsed} left)`
                : "Hear the word"}
            </button>
          )}

          <input
            ref={inputRef}
            className="spelling-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type the spelling..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={phase === "answered"}
            data-gramm="false"
          />

          {phase === "ready" && (
            <button
              className="btn btn-check"
              onClick={checkAnswer}
              disabled={!input.trim()}
              type="button"
            >
              Check
            </button>
          )}

          {phase === "answered" && (
            <div
              className={`result ${correct ? "result-correct" : "result-wrong"}`}
            >
              <p className="result-text">
                {correct ? "Correct!" : "Not quite."}
              </p>
              {!correct && (
                <p className="result-answer">
                  The answer is: <strong>{currentWord.word}</strong>
                </p>
              )}
              <button className="btn btn-next" onClick={nextWord} type="button">
                {lockItInActive
                  ? "Continue"
                  : sessionMode === "learn" && !correct
                    ? "Try again"
                    : wordIndex + 1 < sessionWords.length
                      ? "Next word"
                      : sessionMode === "learn" && learnRetestQueue.length > 0
                        ? "Start retest"
                        : sessionMode === "practice" &&
                            practiceMissedQueue.length > 0
                          ? "Review missed words"
                          : "Finish"}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // SESSION RESULTS
  // ────────────────────────────────────────
  if (screen === "session-results") {
    const totalWords = wordResults.length;
    const correctCount = wordResults.filter((r) => r.correct).length;
    const accuracy =
      totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
    const missed = wordResults.filter((r) => !r.correct);

    return (
      <div className="app">
        {header}

        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            {sessionMode === "test"
              ? "Test"
              : sessionMode === "learn"
                ? "Learn"
                : "Practice"}{" "}
            Complete
          </p>

          <div className="session-score">
            <span className="score-big">{accuracy}%</span>
            <span className="score-detail">
              {correctCount} / {totalWords} correct
            </span>
          </div>

          {sessionResult && sessionResult.levelDirection !== "hold" && (
            <p
              className={`level-change level-${sessionResult.levelDirection}`}
            >
              Level {sessionResult.levelDirection === "up" ? "up" : "down"}:{" "}
              {sessionResult.levelBefore} → {sessionResult.levelAfter}
            </p>
          )}

          {sessionResult?.newBadges && sessionResult.newBadges.length > 0 && (
            <div className="earned-badges">
              <p className="earned-badges-heading">Badges earned!</p>
              {sessionResult.newBadges.map((b) => (
                <div key={b.id} className="earned-badge-row">
                  <span className={`badge-icon badge-icon-${b.icon}`} />
                  <div>
                    <span className="earned-badge-name">{b.name}</span>
                    <span className="earned-badge-desc">{b.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {missed.length > 0 && (
            <div className="missed-words">
              <p className="missed-heading">Words to review:</p>
              {missed.map((r, i) => (
                <div key={i} className="missed-row">
                  <span className="missed-word">{r.word.word}</span>
                  <span className="missed-typed">{r.answerGiven}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-check"
            onClick={() => {
              Promise.all([fetchStats(), fetchBadges(), fetchPendingTest()])
                .then(([s, b, pt]) => { setStats(s); setBadges(b); setPendingTest(pt); })
                .catch(console.error);
              setScreen("home");
            }}
            type="button"
          >
            Back to home
          </button>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────
  // SPEED ROUND
  // ────────────────────────────────────────
  if (screen === "speed-round") {
    return (
      <div className="app">
        {header}

        <p
          className={`speed-timer ${speedTimer <= 10 ? "speed-timer-low" : ""}`}
        >
          {speedTimer}
        </p>

        <div className="speed-stats">
          <span>{speedCorrect} correct</span>
          <span>{speedTotal} total</span>
        </div>

        {speedCurrentWord && (
          <main className="card">
            <p className="definition">{speedCurrentWord.definition}</p>

            <button
              className="btn btn-hear"
              onClick={hearSpeedWord}
              type="button"
            >
              <span className="btn-icon">&#x1f50a;</span> Hear the word
            </button>

            <input
              className="spelling-input"
              type="text"
              value={speedInput}
              onChange={(e) => setSpeedInput(e.target.value)}
              onKeyDown={handleSpeedKeyDown}
              placeholder="Type the spelling..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={speedPhase === "answered"}
              data-gramm="false"
            />

            {speedPhase === "ready" && (
              <button
                className="btn btn-check"
                onClick={checkSpeedAnswer}
                disabled={!speedInput.trim()}
                type="button"
              >
                Go!
              </button>
            )}

            {speedPhase === "answered" && (
              <div
                className={`result ${
                  speedInput.trim().toLowerCase() ===
                  speedCurrentWord.word.toLowerCase()
                    ? "result-correct"
                    : "result-wrong"
                }`}
              >
                <p className="result-text">
                  {speedInput.trim().toLowerCase() ===
                  speedCurrentWord.word.toLowerCase()
                    ? "Correct!"
                    : speedCurrentWord.word}
                </p>
              </div>
            )}
          </main>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────
  // SPEED ROUND RESULTS
  // ────────────────────────────────────────
  if (screen === "speed-round-results") {
    const accuracy =
      speedTotal > 0 ? Math.round((speedCorrect / speedTotal) * 100) : 0;

    return (
      <div className="app">
        {header}

        <main className="card">
          <p className="result-text" style={{ color: "var(--color-main)" }}>
            Speed Round Complete
          </p>

          <div className="session-score">
            <span className="score-big">{speedCorrect}</span>
            <span className="score-detail">
              words spelled correctly in 60 seconds
            </span>
          </div>

          <div className="speed-results-detail">
            <span>Accuracy: {accuracy}%</span>
            <span>Total attempts: {speedTotal}</span>
          </div>

          <button
            className="btn btn-check"
            onClick={() => {
              Promise.all([fetchStats(), fetchBadges(), fetchPendingTest()])
                .then(([s, b, pt]) => {
                  setStats(s);
                  setBadges(b);
                  setPendingTest(pt);
                })
                .catch(console.error);
              setScreen("home");
            }}
            type="button"
          >
            Back to home
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {header}
      <p className="loading">Something went wrong.</p>
    </div>
  );
}
