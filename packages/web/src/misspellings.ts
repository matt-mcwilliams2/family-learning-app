/**
 * Generate plausible misspellings of a word for the pick-correct-spelling
 * exercise. Each misspelling looks like a real mistake a student might make.
 */

const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnpqrstvwxyz";

/** Confusable substring pairs — if the word contains one side, swap it. */
const CONFUSABLES: [string, string][] = [
  ["ph", "f"],
  ["tion", "shun"],
  ["sion", "shun"],
  ["ible", "able"],
  ["able", "ible"],
  ["ence", "ance"],
  ["ance", "ence"],
  ["ie", "ei"],
  ["ei", "ie"],
  ["ck", "k"],
  ["k", "ck"],
  ["sc", "s"],
  ["ce", "se"],
  ["se", "ce"],
  ["ous", "us"],
  ["ough", "uff"],
  ["ght", "te"],
];

// ── Mutation strategies ──
// Each returns a mutated word or null if it can't apply.

function swapVowel(word: string): string | null {
  const positions = [...word].reduce<number[]>((acc, ch, i) => {
    if (VOWELS.includes(ch.toLowerCase())) acc.push(i);
    return acc;
  }, []);
  if (positions.length === 0) return null;

  const pos = positions[Math.floor(Math.random() * positions.length)];
  const current = word[pos].toLowerCase();
  const others = VOWELS.replace(current, "");
  const replacement = others[Math.floor(Math.random() * others.length)];
  return word.slice(0, pos) + replacement + word.slice(pos + 1);
}

function doubleConsonant(word: string): string | null {
  // Find single consonants (not already doubled)
  const positions: number[] = [];
  for (let i = 1; i < word.length - 1; i++) {
    const ch = word[i].toLowerCase();
    if (
      CONSONANTS.includes(ch) &&
      word[i - 1].toLowerCase() !== ch &&
      word[i + 1]?.toLowerCase() !== ch
    ) {
      positions.push(i);
    }
  }
  if (positions.length === 0) return null;
  const pos = positions[Math.floor(Math.random() * positions.length)];
  return word.slice(0, pos) + word[pos] + word.slice(pos);
}

function undoubleConsonant(word: string): string | null {
  for (let i = 1; i < word.length; i++) {
    if (
      word[i].toLowerCase() === word[i - 1].toLowerCase() &&
      CONSONANTS.includes(word[i].toLowerCase())
    ) {
      return word.slice(0, i) + word.slice(i + 1);
    }
  }
  return null;
}

function transpose(word: string): string | null {
  if (word.length < 3) return null;
  // Pick a random interior pair to swap
  const pos = 1 + Math.floor(Math.random() * (word.length - 2));
  if (word[pos] === word[pos + 1]) return null; // swapping identical chars is pointless
  const chars = [...word];
  [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
  return chars.join("");
}

function confusableSubstitution(word: string): string | null {
  // Shuffle confusables so we don't always pick the first match
  const shuffled = [...CONFUSABLES].sort(() => Math.random() - 0.5);
  for (const [from, to] of shuffled) {
    const idx = word.toLowerCase().indexOf(from);
    if (idx !== -1) {
      return word.slice(0, idx) + to + word.slice(idx + from.length);
    }
  }
  return null;
}

function dropLetter(word: string): string | null {
  if (word.length < 4) return null;
  // Drop a random interior letter (not first or last)
  const pos = 1 + Math.floor(Math.random() * (word.length - 2));
  return word.slice(0, pos) + word.slice(pos + 1);
}

function addLetter(word: string): string | null {
  if (word.length < 3) return null;
  // Insert a copy of a neighboring letter at a random interior position
  const pos = 1 + Math.floor(Math.random() * (word.length - 1));
  const letterToAdd = word[pos] || word[pos - 1];
  return word.slice(0, pos) + letterToAdd + word.slice(pos);
}

function randomSubstitution(word: string): string {
  // Fallback: replace a random letter with a random letter
  const pos = Math.floor(Math.random() * word.length);
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let replacement = word[pos];
  while (replacement === word[pos]) {
    replacement = alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return word.slice(0, pos) + replacement + word.slice(pos + 1);
}

const STRATEGIES = [
  swapVowel,
  doubleConsonant,
  undoubleConsonant,
  transpose,
  confusableSubstitution,
  dropLetter,
  addLetter,
];

/**
 * Generate `count` unique, plausible misspellings of `word`.
 * All returned strings are lowercase and guaranteed different from the
 * correct word and from each other.
 */
export function generateMisspellings(word: string, count = 4): string[] {
  const lower = word.toLowerCase();
  const seen = new Set<string>([lower]);
  const results: string[] = [];

  // Cycle through strategies, applying each to the original word
  let attempts = 0;
  const maxAttempts = count * 15; // safety valve

  while (results.length < count && attempts < maxAttempts) {
    attempts++;
    const strategy = STRATEGIES[attempts % STRATEGIES.length];
    const result = strategy(lower);
    if (result && !seen.has(result.toLowerCase())) {
      seen.add(result.toLowerCase());
      results.push(result);
    }
  }

  // Fallback: random substitution if strategies didn't produce enough
  while (results.length < count) {
    const result = randomSubstitution(lower);
    if (!seen.has(result.toLowerCase())) {
      seen.add(result.toLowerCase());
      results.push(result);
    }
  }

  return results;
}
