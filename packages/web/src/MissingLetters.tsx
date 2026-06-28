import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak } from "./speech";
import type { WordFromApi } from "./api";

interface MissingLettersProps {
  word: WordFromApi;
  masteryScore: number;
  onComplete: (correct: boolean, answerGiven: string) => void;
}

/**
 * Decide which letter positions to blank out.
 * Low mastery = few blanks (easy scaffold); high mastery = mostly blanked.
 * blankRatio ranges from ~0.15 at mastery 0 to ~0.9 at mastery 10.
 */
function generateBlanks(word: string, mastery: number): boolean[] {
  const blankRatio = 0.15 + (mastery / 10) * 0.75;
  const len = word.length;
  const blankCount = Math.max(1, Math.round(len * blankRatio));

  // Build shuffled index list
  const indices: number[] = [];
  for (let i = 0; i < len; i++) indices.push(i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const blanks = new Array<boolean>(len).fill(false);
  for (let i = 0; i < Math.min(blankCount, len); i++) {
    blanks[indices[i]] = true;
  }
  return blanks;
}

export function MissingLetters({
  word,
  masteryScore,
  onComplete,
}: MissingLettersProps) {
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [input, setInput] = useState("");
  const [correct, setCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate blank positions once per word
  const blanks = useMemo(
    () => generateBlanks(word.word, masteryScore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word.id, word.word, masteryScore],
  );

  // Build the display template  (e.g. "CO_M_NI_ATE")
  const template = useMemo(
    () =>
      word.word
        .split("")
        .map((ch, i) => (blanks[i] ? "_" : ch))
        .join(""),
    [word.word, blanks],
  );

  const blankCount = blanks.filter(Boolean).length;

  // Reset on new word
  useEffect(() => {
    setPhase("ready");
    setInput("");
    setCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [word.id]);

  const hearWord = useCallback(() => {
    const text =
      word.pronunciationOverride ?? word.pronunciation_override ?? word.word;
    speak(text);
  }, [word]);

  const checkAnswer = useCallback(() => {
    if (!input.trim()) return;
    const isCorrect = input.trim().toLowerCase() === word.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");
  }, [input, word.word]);

  const handleContinue = useCallback(() => {
    onComplete(correct, input.trim());
  }, [correct, input, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "ready") checkAnswer();
        else handleContinue();
      }
    },
    [phase, checkAnswer, handleContinue],
  );

  return (
    <div className="missing-letters-exercise">
      <p className="definition">{word.definition}</p>

      <button className="btn btn-hear" onClick={hearWord} type="button">
        <span className="btn-icon">&#x1f50a;</span> Hear the word
      </button>

      <p className="missing-template">{template}</p>
      <p className="missing-hint">
        {blankCount} missing letter{blankCount !== 1 ? "s" : ""}
      </p>

      <input
        ref={inputRef}
        className="spelling-input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type the full word..."
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
