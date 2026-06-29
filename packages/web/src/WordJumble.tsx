import { useCallback, useEffect, useMemo, useState } from "react";
import { speak } from "./speech";
import type { WordFromApi } from "./api";

interface WordJumbleProps {
  word: WordFromApi;
  onComplete: (correct: boolean, answerGiven: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface TrayTile {
  letter: string;
  id: number;
}

interface BuiltLetter {
  letter: string;
  trayId: number;
}

export function WordJumble({ word, onComplete }: WordJumbleProps) {
  const [built, setBuilt] = useState<BuiltLetter[]>([]);
  const [phase, setPhase] = useState<"building" | "answered">("building");
  const [correct, setCorrect] = useState(false);

  // Generate tray: word letters only (no decoys), shuffled
  // Ensure the scramble is different from the original order
  const tray: TrayTile[] = useMemo(() => {
    const wordLetters = word.word.toLowerCase().split("");
    const tiles = wordLetters.map((letter, i) => ({ letter, id: i }));

    // Try up to 10 times to get a different order
    for (let attempt = 0; attempt < 10; attempt++) {
      const shuffled = shuffle(tiles);
      const shuffledStr = shuffled.map((t) => t.letter).join("");
      if (shuffledStr !== word.word.toLowerCase() || wordLetters.length <= 2) {
        return shuffled;
      }
    }
    // Fallback: reverse
    return tiles.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, word.word]);

  // Derived set of used tile IDs
  const usedIds = useMemo(() => new Set(built.map((b) => b.trayId)), [built]);

  // Reset when word changes
  useEffect(() => {
    setBuilt([]);
    setPhase("building");
    setCorrect(false);
  }, [word.id]);

  const hearWord = useCallback(() => {
    const text =
      word.pronunciationOverride ?? word.pronunciation_override ?? word.word;
    speak(text);
  }, [word]);

  const handleTap = useCallback(
    (id: number, letter: string) => {
      if (phase !== "building") return;
      if (usedIds.has(id)) return;
      setBuilt((prev) => [...prev, { letter, trayId: id }]);
    },
    [phase, usedIds],
  );

  const handleUndo = useCallback(() => {
    if (phase !== "building" || built.length === 0) return;
    setBuilt((prev) => prev.slice(0, -1));
  }, [phase, built.length]);

  const handleClear = useCallback(() => {
    if (phase !== "building") return;
    setBuilt([]);
  }, [phase]);

  const handleCheck = useCallback(() => {
    const builtWord = built.map((b) => b.letter).join("");
    const isCorrect = builtWord === word.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");
  }, [built, word.word]);

  const handleContinue = useCallback(() => {
    const builtWord = built.map((b) => b.letter).join("");
    onComplete(correct, builtWord);
  }, [correct, built, onComplete]);

  const wordLen = word.word.length;

  return (
    <div className="letter-tray-exercise">
      <p className="definition">{word.definition}</p>

      <button className="btn btn-hear" onClick={hearWord} type="button">
        <span className="btn-icon">&#x1f50a;</span> Hear the word
      </button>

      {/* Slots showing the word being built */}
      <div className="built-word">
        {Array.from({ length: wordLen }).map((_, i) => (
          <span
            key={i}
            className={`built-slot ${built[i] ? "built-filled" : ""}`}
          >
            {built[i]?.letter ?? ""}
          </span>
        ))}
      </div>

      {phase === "building" && (
        <>
          {/* Scrambled letter tray */}
          <div className="letter-tray">
            {tray.map((tile) => (
              <button
                key={tile.id}
                className={`tray-tile ${usedIds.has(tile.id) ? "tray-tile-used" : ""}`}
                onClick={() => handleTap(tile.id, tile.letter)}
                disabled={usedIds.has(tile.id)}
                type="button"
              >
                {tile.letter}
              </button>
            ))}
          </div>

          <div className="tray-actions">
            <button
              className="btn-tray-action"
              onClick={handleUndo}
              disabled={built.length === 0}
              type="button"
            >
              Undo
            </button>
            <button
              className="btn-tray-action"
              onClick={handleClear}
              disabled={built.length === 0}
              type="button"
            >
              Clear
            </button>
          </div>

          <button
            className="btn btn-check"
            onClick={handleCheck}
            disabled={built.length !== wordLen}
            type="button"
          >
            Check
          </button>
        </>
      )}

      {phase === "answered" && (
        <div className={`result ${correct ? "result-correct" : "result-wrong"}`}>
          <p className="result-text">{correct ? "Correct!" : "Not quite."}</p>
          {!correct && (
            <p className="result-answer">
              The answer is: <strong>{word.word}</strong>
            </p>
          )}
          <button
            className="btn btn-next"
            onClick={handleContinue}
            type="button"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
