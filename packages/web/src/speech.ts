/**
 * Web Speech API helper that handles iOS Safari quirks:
 * - Speech requires a user gesture on iOS.
 * - Uses the device's default voice (no pinned voice).
 */

export function speak(word: string): void {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.9;
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}
