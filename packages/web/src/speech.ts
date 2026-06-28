/**
 * Web Speech API helper that handles iOS Safari quirks:
 * - Voices load async; we wait for them.
 * - Speech requires a user gesture on iOS.
 * - We pin an en-US voice when available.
 */

let voices: SpeechSynthesisVoice[] = [];
let preferredVoice: SpeechSynthesisVoice | null = null;

function loadVoices(): void {
  voices = speechSynthesis.getVoices();
  // Prefer a natural-sounding en-US voice
  preferredVoice =
    voices.find(
      (v) => v.lang === "en-US" && v.name.includes("Samantha"),
    ) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
}

// Voices may already be loaded, or we may need to wait
loadVoices();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.addEventListener("voiceschanged", loadVoices);
}

export function speak(word: string): void {
  // Cancel any in-progress speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}
