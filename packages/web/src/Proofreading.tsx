import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak } from "./speech";
import { generateMisspellings } from "./misspellings";
import type { WordFromApi } from "./api";

interface ProofreadingProps {
  word: WordFromApi;
  pastMistakes?: string[];
  onComplete: (correct: boolean, answerGiven: string) => void;
}

export function Proofreading({
  word,
  pastMistakes,
  onComplete,
}: ProofreadingProps) {
  const [phase, setPhase] = useState<"identify" | "fix" | "answered">(
    "identify",
  );
  const [fixInput, setFixInput] = useState("");
  const [correct, setCorrect] = useState(false);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the misspelling and sentence
  const { misspelling, sentenceWords, misspelledIdx, hasSentence } =
    useMemo(() => {
      // Pick misspelling: prefer past mistakes, fall back to generated
      let mis: string;
      if (pastMistakes && pastMistakes.length > 0) {
        mis = pastMistakes[Math.floor(Math.random() * pastMistakes.length)];
      } else {
        mis = generateMisspellings(word.word, 1)[0];
      }

      if (!word.example) {
        return {
          misspelling: mis,
          sentenceWords: [] as string[],
          misspelledIdx: -1,
          hasSentence: false,
        };
      }

      // Split sentence into words, find the target word, replace with misspelling
      const tokens = word.example.split(/(\s+)/); // preserves whitespace
      let targetIdx = -1;
      for (let i = 0; i < tokens.length; i++) {
        // Strip punctuation for comparison
        const clean = tokens[i].replace(/[^a-zA-Z]/g, "").toLowerCase();
        if (clean === word.word.toLowerCase()) {
          targetIdx = i;
          break;
        }
      }

      if (targetIdx === -1) {
        return {
          misspelling: mis,
          sentenceWords: [] as string[],
          misspelledIdx: -1,
          hasSentence: false,
        };
      }

      // Replace the word in the token, preserving surrounding punctuation
      const original = tokens[targetIdx];
      const leadingPunct = original.match(/^[^a-zA-Z]*/)?.[0] ?? "";
      const trailingPunct = original.match(/[^a-zA-Z]*$/)?.[0] ?? "";
      tokens[targetIdx] = leadingPunct + mis + trailingPunct;

      return {
        misspelling: mis,
        sentenceWords: tokens,
        misspelledIdx: targetIdx,
        hasSentence: true,
      };
    }, [word.id, word.word, word.example, pastMistakes]);

  // Reset on new word
  useEffect(() => {
    if (hasSentence) {
      setPhase("identify");
    } else {
      // No sentence — skip identify, go straight to fix
      setPhase("fix");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    setFixInput("");
    setCorrect(false);
    setShakeIdx(null);
  }, [word.id, hasSentence]);

  const hearWord = useCallback(() => {
    const text =
      word.pronunciationOverride ?? word.pronunciation_override ?? word.word;
    speak(text);
  }, [word]);

  const handleWordTap = useCallback(
    (idx: number) => {
      if (phase !== "identify") return;

      if (idx === misspelledIdx) {
        // Correct — found the misspelling
        setPhase("fix");
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        // Wrong word tapped — shake it
        setShakeIdx(idx);
        setTimeout(() => setShakeIdx(null), 450);
      }
    },
    [phase, misspelledIdx],
  );

  const handleCheck = useCallback(() => {
    if (!fixInput.trim()) return;
    const isCorrect =
      fixInput.trim().toLowerCase() === word.word.toLowerCase();
    setCorrect(isCorrect);
    setPhase("answered");
  }, [fixInput, word.word]);

  const handleContinue = useCallback(() => {
    onComplete(correct, fixInput.trim());
  }, [correct, fixInput, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phase === "fix") handleCheck();
        else if (phase === "answered") handleContinue();
      }
    },
    [phase, handleCheck, handleContinue],
  );

  return (
    <div className="proofread-exercise">
      <button className="btn btn-hear" onClick={hearWord} type="button">
        <span className="btn-icon">&#x1f50a;</span> Hear the word
      </button>

      {/* Sentence with tappable words (identify phase) */}
      {hasSentence && phase === "identify" && (
        <>
          <p className="proofread-fix-label">
            Tap the misspelled word in the sentence:
          </p>
          <div className="proofread-sentence">
            {sentenceWords.map((token, i) => {
              // Whitespace tokens aren't tappable
              if (/^\s+$/.test(token)) {
                return <span key={i}>{token}</span>;
              }
              const isTarget = i === misspelledIdx;
              const isShaking = i === shakeIdx;
              return (
                <span
                  key={i}
                  className={`proofread-word ${isTarget ? "proofread-word-wrong" : ""} ${isShaking ? "proofread-word-shake" : ""}`}
                  onClick={() => handleWordTap(i)}
                >
                  {token}
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* Sentence with highlighted misspelling (fix phase) */}
      {hasSentence && phase === "fix" && (
        <div className="proofread-sentence">
          {sentenceWords.map((token, i) => {
            if (/^\s+$/.test(token)) {
              return <span key={i}>{token}</span>;
            }
            const isTarget = i === misspelledIdx;
            return (
              <span
                key={i}
                className={`proofread-word ${isTarget ? "proofread-word-found" : ""}`}
              >
                {token}
              </span>
            );
          })}
        </div>
      )}

      {/* No-sentence fallback — show misspelling with definition */}
      {!hasSentence && phase === "fix" && (
        <>
          <p className="definition">{word.definition}</p>
          <p className="proofread-fix-label">
            This word is misspelled:{" "}
            <strong className="proofread-word-wrong">{misspelling}</strong>
          </p>
        </>
      )}

      {/* Fix input */}
      {phase === "fix" && (
        <>
          <p className="proofread-fix-label">Type the correct spelling:</p>
          <input
            ref={inputRef}
            className="spelling-input"
            type="text"
            value={fixInput}
            onChange={(e) => setFixInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Correct spelling..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-gramm="false"
          />
          <button
            className="btn btn-check"
            onClick={handleCheck}
            disabled={!fixInput.trim()}
            type="button"
          >
            Check
          </button>
        </>
      )}

      {/* Result */}
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
