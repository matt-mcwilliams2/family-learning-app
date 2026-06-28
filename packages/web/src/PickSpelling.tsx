import { useCallback, useEffect, useMemo, useState } from "react";
import { speak } from "./speech";
import { generateMisspellings } from "./misspellings";
import type { WordFromApi } from "./api";

interface PickSpellingProps {
  word: WordFromApi;
  onComplete: (correct: boolean, answerGiven: string) => void;
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

export function PickSpelling({ word, onComplete }: PickSpellingProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<"choosing" | "answered">("choosing");

  // Generate options once per word
  const options = useMemo(() => {
    const misspellings = generateMisspellings(word.word, 4);
    return shuffle([word.word.toLowerCase(), ...misspellings]);
  }, [word.id, word.word]);

  // Reset when word changes
  useEffect(() => {
    setSelected(null);
    setPhase("choosing");
  }, [word.id]);

  const correctLower = word.word.toLowerCase();

  const handlePick = useCallback(
    (option: string) => {
      if (phase !== "choosing") return;
      setSelected(option);
      setPhase("answered");
    },
    [phase],
  );

  const handleContinue = useCallback(() => {
    if (!selected) return;
    const isCorrect = selected === correctLower;
    onComplete(isCorrect, selected);
  }, [selected, correctLower, onComplete]);

  const hearWord = useCallback(() => {
    const text =
      word.pronunciationOverride ?? word.pronunciation_override ?? word.word;
    speak(text);
  }, [word]);

  return (
    <div className="pick-exercise">
      <p className="definition">{word.definition}</p>

      <button className="btn btn-hear" onClick={hearWord} type="button">
        <span className="btn-icon">&#x1f50a;</span> Hear the word
      </button>

      <div className="pick-options">
        {options.map((option) => {
          let className = "pick-option";
          if (phase === "answered") {
            if (option === correctLower) {
              className += " pick-option-correct";
            } else if (option === selected) {
              className += " pick-option-wrong";
            } else {
              className += " pick-option-dimmed";
            }
          }
          return (
            <button
              key={option}
              className={className}
              onClick={() => handlePick(option)}
              disabled={phase === "answered"}
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>

      {phase === "answered" && (
        <button className="btn btn-next" onClick={handleContinue} type="button">
          Continue
        </button>
      )}
    </div>
  );
}
