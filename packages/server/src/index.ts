import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import pool from "./db.js";
import { requireAuth } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { teacherRouter } from "./routes/teacher.js";
import { wordsRouter } from "./routes/words.js";
import { attemptsRouter } from "./routes/attempts.js";
import { statsRouter } from "./routes/stats.js";
import { masteryRouter } from "./routes/mastery.js";
import { schedulerRouter } from "./routes/scheduler.js";
import { sessionsRouter } from "./routes/sessions.js";
import { placementRouter } from "./routes/placement.js";
import { badgesRouter } from "./routes/badges.js";
import { assignedTestsRouter } from "./routes/assigned-tests.js";
import { adminRouter } from "./routes/admin.js";
import { mathRouter } from "./routes/math.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json());

// ---- API routes ----

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", db_time: result.rows[0].now });
  } catch (err) {
    console.error("DB health check failed:", err);
    res.status(500).json({ status: "error", message: "Cannot reach database" });
  }
});

// Auth routes (no auth required on these)
app.use("/api/auth", authRouter);

// Teacher dashboard (parent-only, auth handled inside router)
app.use("/api/teacher", teacherRouter);

// Admin dashboard (admin-only, auth handled inside router)
app.use("/api/admin", adminRouter);

// All child-facing API routes require auth
app.use("/api/words", requireAuth, wordsRouter);
app.use("/api/attempts", requireAuth, attemptsRouter);
app.use("/api/stats", requireAuth, statsRouter);
app.use("/api/mastery", requireAuth, masteryRouter);
app.use("/api/scheduler", requireAuth, schedulerRouter);
app.use("/api/sessions", requireAuth, sessionsRouter);
app.use("/api/placement", requireAuth, placementRouter);
app.use("/api/badges", requireAuth, badgesRouter);
app.use("/api/assigned-tests", requireAuth, assignedTestsRouter);
app.use("/api/math", requireAuth, mathRouter);

// ---- Static files (built frontend) ----
// Serve the Vite build from packages/web/dist whenever it exists.
// In dev, the folder won't be there and Vite's own dev server handles it.

const webDist = path.resolve(__dirname, "../../web/dist");

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));

  // SPA fallback: any non-API GET that doesn't match a static file
  // gets index.html so client-side routing works.
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });

  console.log(`Serving static files from ${webDist}`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});
