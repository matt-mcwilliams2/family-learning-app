import pool from "./db.js";
import { WORD_BANK } from "./word-bank.js";

async function seedWords() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inserted = 0;
    let skipped = 0;

    for (const w of WORD_BANK) {
      // Skip if this exact word + grade + app already exists
      const existing = await client.query(
        "SELECT 1 FROM words WHERE word = $1 AND grade = $2 AND app = 'spelling'",
        [w.word, w.grade],
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO words (app, word, grade, definition, example, syllables, pronunciation_override, source)
         VALUES ('spelling', $1, $2, $3, $4, $5, $6, 'bank')`,
        [
          w.word,
          w.grade,
          w.definition,
          w.example,
          w.syllables,
          w.pronunciationOverride ?? null,
        ],
      );
      inserted++;
    }

    await client.query("COMMIT");
    console.log(
      `Word bank seeded: ${inserted} inserted, ${skipped} skipped (already existed).`,
    );
    console.log(
      `Total bank entries: ${WORD_BANK.length} across grades 4-9.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Word bank seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedWords();
