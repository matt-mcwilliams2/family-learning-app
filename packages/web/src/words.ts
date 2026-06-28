/** A small hardcoded set of 6th-grade words for the first slice. */

export interface Word {
  word: string;
  definition: string;
}

export const WORDS: Word[] = [
  { word: "accommodate", definition: "to provide space or make room for" },
  { word: "acknowledge", definition: "to accept or admit the truth of something" },
  { word: "apparently", definition: "as far as one can see or understand" },
  { word: "catastrophe", definition: "a sudden and terrible disaster" },
  { word: "conscience", definition: "an inner feeling of right and wrong" },
  { word: "exaggerate", definition: "to make something seem bigger than it really is" },
  { word: "guarantee", definition: "a firm promise that something will happen" },
  { word: "independent", definition: "able to do things on your own" },
  { word: "mischievous", definition: "playfully causing trouble" },
  { word: "necessary", definition: "needed; something you must have or do" },
  { word: "occurrence", definition: "something that happens; an event" },
  { word: "persuade", definition: "to talk someone into doing or believing something" },
  { word: "privilege", definition: "a special right or advantage" },
  { word: "recommend", definition: "to suggest something as a good choice" },
  { word: "rhythm", definition: "a regular repeated pattern of sound or movement" },
  { word: "schedule", definition: "a plan that lists times for events or tasks" },
  { word: "sufficient", definition: "enough; as much as is needed" },
  { word: "temperature", definition: "how hot or cold something is" },
  { word: "thorough", definition: "done carefully and completely" },
  { word: "vegetable", definition: "a plant grown for food" },
];

/** Pick a random word, optionally excluding one. */
export function randomWord(exclude?: string): Word {
  const pool = exclude ? WORDS.filter((w) => w.word !== exclude) : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}
