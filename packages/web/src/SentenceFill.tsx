import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak } from "./speech";
import type { WordFromApi } from "./api";

interface SentenceFillProps {
  word: WordFromApi;
  onComplete: (correct: boolean, answerGiven: string) => void;
}

export function SentenceFill({ word, onComplete }: SentenceFillProps) {
  const [phase, setPhase] = useState<"ready" | "answered">("ready");
  const [input, setInput] = useState("");
  const [correct, setCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the display sentence with the word blanked out
  const { sentence, hasContext } = useMemo(() => {
    if (!word.example) {
      return { sentence: null, hasContext: false };
    }
    // Replace the word in the sentence with a blank (case-insensitive)
    const regex = new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const blanked = word.example.replace(regex, "____");
    // Check if we actually replaced something
    if (blanked === word.example) {
      return { sentence: null, hasContext: false };
    }
    return { sentence: blanked, hasContext: true };
  }, [word.id, word.word, word.example]);

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
    <div className="sentence-fill-exercise">
      {hasContext && sentence ? (
        <p className="sentence-display">{sentence}</p>
      ) : (
        <p className="definition">{word.definition}</p>
      )}

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
        placeholder="Type the word..."
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
