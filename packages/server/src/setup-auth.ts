/**
 * One-time setup: creates the parent account and test student.
 * Safe to run multiple times — checks for existing accounts.
 * Migrates any existing child data to the test student.
 *
 * Usage: npx tsx src/setup-auth.ts
 */
import pool from "./db.js";
import bcrypt from "bcryptjs";

const PARENT_EMAIL = "parent@mcwilliams.family";
const PARENT_PASSWORD = "OwlSpell2025!";
const PARENT_NAME = "Parent";
const SALT_ROUNDS = 10;

const ADMIN_EMAIL = "matt@mattmcwilliams.com";
const ADMIN_PASSWORD = "R87%3h9s%h3SHh62hsi%@!!";
const ADMIN_NAME = "Admin";

const TEST_USERNAME = "test123";
const TEST_PASSWORD = "test123";
const TEST_FIRST = "Test";
const TEST_LAST = "Student";

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

    // ── Create test student ──
    const existingTest = await client.query(
      "SELECT id FROM users WHERE username = $1",
      [TEST_USERNAME],
    );

    let testStudentId: number;

    if (existingTest.rows.length > 0) {
      testStudentId = existingTest.rows[0].id;
      console.log(`Test student already exists (id=${testStudentId}), skipping creation.`);
    } else {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
      const testResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, username, password_hash,
                            first_name, last_name, current_level, active)
         VALUES ($1, $2, 'child', $3, $4, $5, $6, 6.0, true)
         RETURNING id`,
        [familyId, `${TEST_FIRST} ${TEST_LAST}`, TEST_USERNAME, passwordHash, TEST_FIRST, TEST_LAST],
      );
      testStudentId = testResult.rows[0].id;

      // Create user_stats row
      await client.query(
        `INSERT INTO user_stats (user_id, app, total_points, current_streak, longest_streak)
         VALUES ($1, 'spelling', 0, 0, 0)
         ON CONFLICT (user_id, app) DO NOTHING`,
        [testStudentId],
      );

      console.log(`Created test student id=${testStudentId}`);
      console.log(`  Username: ${TEST_USERNAME}`);
      console.log(`  Password: ${TEST_PASSWORD}`);
    }

    // ── Create admin account ──
    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE email = $1 AND role = 'admin'",
      [ADMIN_EMAIL],
    );

    if (existingAdmin.rows.length > 0) {
      console.log("Admin account already exists, skipping creation.");
    } else {
      const adminHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
      const adminResult = await client.query(
        `INSERT INTO users (family_id, display_name, role, email, password_hash,
                            first_name, last_name, current_level)
         VALUES (NULL, $1, 'admin', $2, $3, 'Matt', 'McWilliams', 6.0)
         RETURNING id`,
        [ADMIN_NAME, ADMIN_EMAIL, adminHash],
      );
      console.log(`Created admin account id=${adminResult.rows[0].id}`);
      console.log(`  Email:    ${ADMIN_EMAIL}`);
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
