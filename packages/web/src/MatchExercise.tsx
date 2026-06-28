import { useCallback, useEffect, useState } from "react";
import { postAttempt, fetchStats, type WordFromApi } from "./api";

interface MatchExerciseProps {
  words: WordFromApi[];
  mode: "learn" | "practice";
  onComplete: () => void;
  onStatsUpdate: (stats: any) => void;
}

/** Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function MatchExercise({
  words,
  mode,
  onComplete,
  onStatsUpdate,
}: MatchExerciseProps) {
  const BATCH_SIZE = 5;

  // Pool of words not yet shown
  const [pool, setPool] = useState<WordFromApi[]>([]);
  // Currently displayed batch of words
  const [activeWords, setActiveWords] = useState<WordFromApi[]>([]);
  // Shuffled definitions for the active batch
  const [shuffledDefs, setShuffledDefs] = useState<
    Array<{ wordId: number; definition: string }>
  >([]);
  // IDs of words already matched in the current batch
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  // Total matched across all batches
  const [totalMatched, setTotalMatched] = useState(0);
  // Selection state
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const [selectedDefId, setSelectedDefId] = useState<number | null>(null);
  // Flash state for correct/wrong feedback
  const [flashCorrectId, setFlashCorrectId] = useState<number | null>(null);
  const [flashWrongPair, setFlashWrongPair] = useState<{
    wordId: number;
    defId: number;
  } | null>(null);

  // Initialize on mount
  useEffect(() => {
    const all = [...words];
    const first = all.slice(0, BATCH_SIZE);
    const rest = all.slice(BATCH_SIZE);
    setPool(rest);
    setActiveWords(first);
    setShuffledDefs(
      shuffle(first.map((w) => ({ wordId: w.id, definition: w.definition }))),
    );
    setMatchedIds(new Set());
    setTotalMatched(0);
    setSelectedWordId(null);
    setSelectedDefId(null);
  }, [words]);

  // Load next batch when all current words are matched
  useEffect(() => {
    if (activeWords.length === 0) return;
    if (matchedIds.size < activeWords.length) return;

    // All current batch matched — load next batch or complete
    if (pool.length === 0) {
      onComplete();
      return;
    }

    const next = pool.slice(0, BATCH_SIZE);
    const rest = pool.slice(BATCH_SIZE);

    setPool(rest);
    setActiveWords(next);
    setShuffledDefs(
      shuffle(next.map((w) => ({ wordId: w.id, definition: w.definition }))),
    );
    setMatchedIds(new Set());
    setSelectedWordId(null);
    setSelectedDefId(null);
  }, [matchedIds, activeWords, pool, onComplete]);

  const handleWordTap = useCallback(
    (wordId: number) => {
      if (matchedIds.has(wordId)) return;
      if (flashCorrectId || flashWrongPair) return; // during animation
      setSelectedWordId((prev) => (prev === wordId ? null : wordId));
      setSelectedDefId(null);
    },
    [matchedIds, flashCorrectId, flashWrongPair],
  );

  const handleDefTap = useCallback(
    async (defWordId: number) => {
      if (matchedIds.has(defWordId)) return;
      if (flashCorrectId || flashWrongPair) return;
      if (selectedWordId === null) return;

      const isCorrect = selectedWordId === defWordId;

      // Record the attempt
      try {
        await postAttempt({
          wordId: selectedWordId,
          correct: isCorrect,
          answerGiven: isCorrect ? "(matched)" : "(wrong match)",
          exerciseType: "match_definition",
          mode,
        });
        const newStats = await fetchStats();
        onStatsUpdate(newStats);
      } catch (err) {
        console.error("Failed to record match attempt:", err);
      }

      if (isCorrect) {
        setFlashCorrectId(selectedWordId);
        setTimeout(() => {
          setMatchedIds((prev) => new Set([...prev, selectedWordId]));
          setTotalMatched((prev) => prev + 1);
          setSelectedWordId(null);
          setSelectedDefId(null);
          setFlashCorrectId(null);
        }, 500);
      } else {
        setFlashWrongPair({ wordId: selectedWordId, defId: defWordId });
        setTimeout(() => {
          setSelectedWordId(null);
          setSelectedDefId(null);
          setFlashWrongPair(null);
        }, 600);
      }
    },
    [selectedWordId, matchedIds, mode, onStatsUpdate, flashCorrectId, flashWrongPair],
  );

  const unmatchedWords = activeWords.filter((w) => !matchedIds.has(w.id));
  const unmatchedDefs = shuffledDefs.filter((d) => !matchedIds.has(d.wordId));

  return (
    <div className="match-exercise">
      <p className="match-progress">
        Matched {totalMatched} / {words.length}
      </p>

      <div className="match-container">
        {/* Words column */}
        <div className="match-column">
          {unmatchedWords.map((w) => {
            let className = "match-item match-word";
            if (flashCorrectId === w.id) {
              className += " match-correct-flash";
            } else if (flashWrongPair?.wordId === w.id) {
              className += " match-wrong-flash";
            } else if (selectedWordId === w.id) {
              className += " match-selected";
            }
            return (
              <button
                key={w.id}
                className={className}
                onClick={() => handleWordTap(w.id)}
                type="button"
              >
                {w.word}
              </button>
            );
          })}
        </div>

        {/* Definitions column */}
        <div className="match-column">
          {unmatchedDefs.map((d) => {
            let className = "match-item match-def";
            if (flashCorrectId === d.wordId) {
              className += " match-correct-flash";
            } else if (flashWrongPair?.defId === d.wordId) {
              className += " match-wrong-flash";
            } else if (selectedDefId === d.wordId) {
              className += " match-selected";
            }
            return (
              <button
                key={d.wordId}
                className={className}
                onClick={() => handleDefTap(d.wordId)}
                type="button"
              >
                {d.definition}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
