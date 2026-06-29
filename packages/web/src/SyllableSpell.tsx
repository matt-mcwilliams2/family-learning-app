import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak } from "./speech";
import type { WordFromApi } from "./api";

interface SyllableSpellProps {
  word: WordFromApi;
  onComplete: (correct: boolean, answerGiven: string) => void;
}

interface SyllableResult {
  syllable: string;
  typed: string;
  correct: boolean;
}

export function SyllableSpell({ word, onComplete }: SyllableSpellProps) {
  const syllables = useMemo(() => {
    if (!word.syllables) return null;
    const parts = word.syllables.split("-").map((s) => s.trim().toLowerCase());
    return parts.length > 1 ? parts : null;
  }, [word.id, word.syllables]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SyllableResult[]>([]);
  const [phase, setPhase] = useState<"spelling" | "flash" | "done">(
    "spelling",
  );
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [wholeInput, setWholeInput] = useState("");
  const [wholePhase, setWholePhase] = useState<"ready" | "answered">("ready");
  const [wholeCorrect, setWholeCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on new word
  useEffect(() => {
    setCurrentIdx(0);
    setInput("");
    setResults([]);
    setPhase("spelling");
    setFlashCorrect(false);
    setWholeInput("");
    setWholePhase("ready");
    setWholeCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [word.id]);

  const hearWord = useCallback(() => {
    const text =
      word.pronunciationOverride ?? word.pronunciation_override ?? word.word;
    speak(text);
  }, [word]);

  // Syllable-by-syllable mode
  const handleSyllableCheck = useCallback(() => {
    if (!syllables || !input.trim()) return;
    const target = syllables[currentIdx];
    const isCorrect = input.trim().toLowerCase() === target;

    const result: SyllableResult = {
      syllable: target,
      typed: input.trim().toLowerCase(),
      correct: isCorrect,
    };

    setResults((prev) => [...prev, result]);
    setFlashCorrect(isCorrect);
    setPhase("flash");

    // Brief flash showing result, then advance
    setTimeout(() => {
      const nextIdx = currentIdx + 1;
      if (nextIdx < syllables.length) {
        setCurrentIdx(nextIdx);
        setInput("");
        setPhase("spelling");
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        // All syllables done
        setPhase("done");
      }
    }, isCorrect ? 400 : 1000);
  }, [syllables, input, currentIdx]);

  const handleSyllableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "spelling") handleSyllableCheck();
        else if (phase === "done") {
          const allCorrect = [...results].every((r) => r.correct);
          const fullAnswer = [...results].map((r) => r.typed).join("");
          onComplete(allCorrect, fullAnswer);
        }
      }
    },
    [phase, handleSyllableCheck, results, onComplete],
  );

  const handleSyllableContinue = useCallback(() => {
    const allCorrect = results.every((r) => r.correct);
    const fullAnswer = results.map((r) => r.typed).join("");
    onComplete(allCorrect, fullAnswer);
  }, [results, onComplete]);

  // Whole-word fallback mode (no syllable data)
  const handleWholeCheck = useCallback(() => {
    if (!wholeInput.trim()) return;
    const isCorrect =
      wholeInput.trim().toLowerCase() === word.word.toLowerCase();
    setWholeCorrect(isCorrect);
    setWholePhase("answered");
  }, [wholeInput, word.word]);

  const handleWholeContinue = useCallback(() => {
    onComplete(wholeCorrect, wholeInput.trim());
  }, [wholeCorrect, wholeInput, onComplete]);

  const handleWholeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (wholePhase === "ready") handleWholeCheck();
        else handleWholeContinue();
      }
    },
    [wholePhase, handleWholeCheck, handleWholeContinue],
  );

  // Fallback: no syllable data — simple hear-and-spell
  if (!syllables) {
    return (
      <div className="syllable-exercise">
        <p className="definition">{word.definition}</p>

        <button className="btn btn-hear" onClick={hearWord} type="button">
          <span className="btn-icon">&#x1f50a;</span> Hear the word
        </button>

        <input
          ref={inputRef}
          className="spelling-input"
          type="text"
          value={wholeInput}
          onChange={(e) => setWholeInput(e.target.value)}
          onKeyDown={handleWholeKeyDown}
          placeholder="Type the word..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={wholePhase === "answered"}
          data-gramm="false"
        />

        {wholePhase === "ready" && (
          <button
            className="btn btn-check"
            onClick={handleWholeCheck}
            disabled={!wholeInput.trim()}
            type="button"
          >
            Check
          </button>
        )}

        {wholePhase === "answered" && (
          <div
            className={`result ${wholeCorrect ? "result-correct" : "result-wrong"}`}
          >
            <p className="result-text">
              {wholeCorrect ? "Correct!" : "Not quite."}
            </p>
            {!wholeCorrect && (
              <p className="result-answer">
                The answer is: <strong>{word.word}</strong>
              </p>
            )}
            <button
              className="btn btn-next"
              onClick={handleWholeContinue}
              type="button"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    );
  }

  // Syllable-by-syllable mode
  const allCorrect = phase === "done" && results.every((r) => r.correct);
  const anyWrong = phase === "done" && results.some((r) => !r.correct);

  return (
    <div className="syllable-exercise">
      <p className="definition">{word.definition}</p>

      <button className="btn btn-hear" onClick={hearWord} type="button">
        <span className="btn-icon">&#x1f50a;</span> Hear the word
      </button>

      {/* Syllable display */}
      <div className="syllable-display">
        {syllables.map((syl, i) => {
          let cls = "syllable-chunk ";
          if (i < results.length) {
            // Already answered
            cls += results[i].correct ? "syllable-done" : "syllable-wrong";
          } else if (i === currentIdx && phase !== "done") {
            cls += "syllable-active";
          } else {
            cls += "syllable-pending";
          }

          const showText =
            i < results.length
              ? results[i].correct
                ? syl
                : syl // show correct syllable after answering
              : i === currentIdx && phase === "flash"
                ? flashCorrect
                  ? input.trim().toLowerCase()
                  : syl
                : i < currentIdx
                  ? syl
                  : "\u00A0\u00A0\u00A0"; // non-breaking spaces as placeholder

          return (
            <span key={i} className={cls}>
              {showText}
            </span>
          );
        })}
      </div>

      {/* Input for current syllable */}
      {phase === "spelling" && (
        <>
          <p className="proofread-fix-label">
            Syllable {currentIdx + 1} of {syllables.length}
          </p>
          <input
            ref={inputRef}
            className="spelling-input syllable-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleSyllableKeyDown}
            placeholder={`Syllable ${currentIdx + 1}...`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-gramm="false"
          />
          <button
            className="btn btn-check"
            onClick={handleSyllableCheck}
            disabled={!input.trim()}
            type="button"
          >
            Check
          </button>
        </>
      )}

      {/* Flash showing result of current syllable */}
      {phase === "flash" && (
        <p
          className={`result-text ${flashCorrect ? "" : ""}`}
          style={{ color: flashCorrect ? "var(--color-correct)" : "var(--color-third)" }}
        >
          {flashCorrect ? "Got it!" : `It's "${syllables[currentIdx]}"`}
        </p>
      )}

      {/* Final result */}
      {phase === "done" && (
        <div
          className={`result ${allCorrect ? "result-correct" : "result-wrong"}`}
        >
          <p className="result-text">
            {allCorrect
              ? "Correct!"
              : anyWrong
                ? "Not quite."
                : ""}
          </p>
          {anyWrong && (
            <p className="result-answer">
              The answer is: <strong>{word.word}</strong>{" "}
              <span style={{ color: "#888" }}>
                ({syllables.join("-")})
              </span>
            </p>
          )}
          <button
            className="btn btn-next"
            onClick={handleSyllableContinue}
            type="button"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
