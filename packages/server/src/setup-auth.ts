/**
 * One-time setup: creates the parent account and hashes the child's PIN.
 * Safe to run multiple times — checks for existing accounts.
 *
 * Usage: npx tsx src/setup-auth.ts
 */
import pool from "./db.js";
import bcrypt from "bcryptjs";

const PARENT_EMAIL = "parent@mcwilliams.family";
const PARENT_PASSWORD = "OwlSpell2025!";
const PARENT_NAME = "Parent";
const SALT_ROUNDS = 10;

async function setup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find the family
    const familyResult = await client.query(
      "SELECT id FROM families ORDER BY id LIMIT 1",
    );
    if (familyResult.rows.length === 0) {
      console.error("No family found. Run the seed first.");
      process.exit(1);
    }
    const familyId = familyResult.rows[0].id;

    // Check if parent already exists
    const existingParent = await client.query(
      "SELECT id FROM users WHERE family_id = $1 AND role = 'parent'",
      [familyId],
    );

    if (existingParent.rows.length > 0) {
      console.log("Parent account already exists, skipping creation.");
    } else {
      const passwordHash = await bcrypt.hash(PARENT_PASSWORD, SALT_ROUNDS);
      const parentResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, email, password_hash, current_level)
         VALUES ($1, $2, 'parent', $3, $4, 6.0)
         RETURNING id`,
        [familyId, PARENT_NAME, PARENT_EMAIL, passwordHash],
      );
      console.log(`Created parent account id=${parentResult.rows[0].id}`);
      console.log(`  Email:    ${PARENT_EMAIL}`);
      console.log(`  Password: ${PARENT_PASSWORD}`);
    }

    // Hash any plain-text child PINs
    const children = await client.query(
      "SELECT id, pin, display_name FROM users WHERE family_id = $1 AND role = 'child'",
      [familyId],
    );

    for (const child of children.rows) {
      if (!child.pin) continue;
      // bcrypt hashes start with "$2a$" or "$2b$". If the PIN doesn't
      // start with "$2", it's plain text and needs hashing.
      if (child.pin.startsWith("$2")) {
        console.log(`Child "${child.display_name}" PIN already hashed.`);
        continue;
      }
      const hashedPin = await bcrypt.hash(child.pin, SALT_ROUNDS);
      await client.query("UPDATE users SET pin = $1 WHERE id = $2", [
        hashedPin,
        child.id,
      ]);
      console.log(
        `Hashed PIN for child "${child.display_name}" (was: ${child.pin})`,
      );
    }

    await client.query("COMMIT");
    console.log("Auth setup complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Setup failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
