import pool from "./db.js";

const WORDS = [
  { word: "accommodate", grade: 6, definition: "to provide space or make room for", example: "The hotel can accommodate up to 200 guests.", syllables: "ac-com-mo-date" },
  { word: "acknowledge", grade: 6, definition: "to accept or admit the truth of something", example: "She had to acknowledge her mistake.", syllables: "ac-knowl-edge" },
  { word: "apparently", grade: 6, definition: "as far as one can see or understand", example: "Apparently, the game was canceled due to rain.", syllables: "ap-par-ent-ly" },
  { word: "catastrophe", grade: 6, definition: "a sudden and terrible disaster", example: "The flood was a catastrophe for the town.", syllables: "ca-tas-tro-phe" },
  { word: "conscience", grade: 6, definition: "an inner feeling of right and wrong", example: "His conscience told him to return the lost wallet.", syllables: "con-science" },
  { word: "exaggerate", grade: 6, definition: "to make something seem bigger than it really is", example: "He tends to exaggerate how far he can throw.", syllables: "ex-ag-ger-ate" },
  { word: "guarantee", grade: 6, definition: "a firm promise that something will happen", example: "The store offers a money-back guarantee.", syllables: "guar-an-tee" },
  { word: "independent", grade: 6, definition: "able to do things on your own", example: "She is very independent and does her own laundry.", syllables: "in-de-pen-dent" },
  { word: "mischievous", grade: 6, definition: "playfully causing trouble", example: "The mischievous puppy chewed up the slippers.", syllables: "mis-chie-vous" },
  { word: "necessary", grade: 6, definition: "needed; something you must have or do", example: "Water is necessary for all living things.", syllables: "nec-es-sar-y" },
  { word: "occurrence", grade: 6, definition: "something that happens; an event", example: "Thunderstorms are a common occurrence in summer.", syllables: "oc-cur-rence" },
  { word: "persuade", grade: 6, definition: "to talk someone into doing or believing something", example: "She tried to persuade him to join the team.", syllables: "per-suade" },
  { word: "privilege", grade: 6, definition: "a special right or advantage", example: "It is a privilege to meet the author.", syllables: "priv-i-lege" },
  { word: "recommend", grade: 6, definition: "to suggest something as a good choice", example: "I recommend the pizza at that restaurant.", syllables: "rec-om-mend" },
  { word: "rhythm", grade: 6, definition: "a regular repeated pattern of sound or movement", example: "The drummer kept a steady rhythm.", syllables: "rhy-thm" },
  { word: "schedule", grade: 6, definition: "a plan that lists times for events or tasks", example: "Check the schedule to see when practice starts.", syllables: "sched-ule" },
  { word: "sufficient", grade: 6, definition: "enough; as much as is needed", example: "We have sufficient food for the whole trip.", syllables: "suf-fi-cient" },
  { word: "temperature", grade: 6, definition: "how hot or cold something is", example: "The temperature dropped below freezing last night.", syllables: "tem-per-a-ture" },
  { word: "thorough", grade: 6, definition: "done carefully and completely", example: "She did a thorough job cleaning her room.", syllables: "thor-ough" },
  { word: "vegetable", grade: 6, definition: "a plant grown for food", example: "Broccoli is a healthy vegetable.", syllables: "veg-e-ta-ble" },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if already seeded
    const existingFamily = await client.query("SELECT 1 FROM families LIMIT 1");
    if (existingFamily.rows.length > 0) {
      console.log("Database already seeded, skipping.");
      await client.query("COMMIT");
      return;
    }

    // Create family
    const familyResult = await client.query(
      "INSERT INTO families (name) VALUES ($1) RETURNING id",
      ["McWilliams"],
    );
    const familyId = familyResult.rows[0].id;
    console.log(`Created family id=${familyId}`);

    // Create child
    const childResult = await client.query(
      `INSERT INTO users (family_id, display_name, role, pin, current_level)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [familyId, "Player 1", "child", "1234", 6.0],
    );
    const childId = childResult.rows[0].id;
    console.log(`Created child id=${childId}`);

    // Create user_stats row for the child
    await client.query(
      `INSERT INTO user_stats (user_id, app, total_points, current_streak, longest_streak)
       VALUES ($1, 'spelling', 0, 0, 0)`,
      [childId],
    );
    console.log("Created user_stats row");

    // Seed words
    for (const w of WORDS) {
      await client.query(
        `INSERT INTO words (app, word, grade, definition, example, syllables, source)
         VALUES ('spelling', $1, $2, $3, $4, $5, 'bank')`,
        [w.word, w.grade, w.definition, w.example, w.syllables],
      );
    }
    console.log(`Seeded ${WORDS.length} words`);

    await client.query("COMMIT");
    console.log("Seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
