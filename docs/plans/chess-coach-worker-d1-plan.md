# Chess Coach — Cloudflare Worker + D1 (SQL) Plan
> Single-user, no-auth, Vercel frontend stays, Worker is the SQL API. Replaces `chess-coach.html:353` inline `PUZZLES[48]` + volatile `currentPuzzle/puzzleSolved:355`. Keeps `vercel.json:2` static deploy.

## 1. Goal
- Add puzzles without editing JS
- Persist solved progress across reloads/devices
- Filter/search by rating/bucket (`bucketOf():650` `easy ≤1100 / medium ≤1500 / hard ≤1900 / expert`), themes/type (`mateIn1`, `fork`, `sacrifice`, ... 30 values), free-text `q` (id/themes), and solved status
- Stay on Vercel (`{"cleanUrls":true}`) with offline fallback to embedded array + `localStorage`

## 2. Architecture
```
[Vercel: chess-coach.html + index.html (copy)] --fetch/CORS--> [Cloudflare Worker https://chess-coach-api.<you>.workers.dev] --env.DB--> D1 chess-coach
  GET  /api/puzzles?ratingMin&ratingMax&themes=mateIn1,fork&q=rook&status=solved|unsolved&limit=50
  POST /api/puzzles {fen, solution, rating, themes}
  GET  /api/progress
  POST /api/progress {puzzle_id, attempts, hints_used}
```
- Frontend keeps CDN `chess.js 0.10.3:7`, adds `fetch(WORKER_URL)` in IIFE `chess-coach.html:338`.
- SDK: D1 Binding API (`env.DB.prepare(sql).bind(...).all()`). No Firebase.
- Auth: no login UI now. Public read/write for dev; later gate with `X-API-Key` Worker secret or invisible `signInAnonymously()` without UX change. Worker CORS allows `https://<vercel>.vercel.app` (or `*` dev).

## 3. Storage Choice — D1 > KV / R2
- **D1 (SQLite SQL)**: `WHERE rating BETWEEN`, `themes && array`, `JOIN progress`, transactions, free tier, Wrangler-native, `IN (SELECT puzzle_id FROM puzzle_themes WHERE theme IN (...))`.
- **KV**: key-value only — no SQL filter.
- **R2**: object store.
- Use D1 for both `puzzles` + `progress` (single DB).

## 4. Schema (D1 / SQLite)
```sql
CREATE TABLE puzzles (
  id TEXT PRIMARY KEY, -- Lichess id e.g. 'cayPa'
  rating INTEGER NOT NULL,
  fen TEXT NOT NULL,
  player_color TEXT NOT NULL CHECK(player_color IN ('w','b')),
  solution TEXT NOT NULL, -- JSON array '["h3f2","..."]'
  themes TEXT NOT NULL,    -- JSON array '["mateIn1","fork"]'
  source TEXT DEFAULT 'lichess',
  added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_puzzles_rating ON puzzles(rating);

CREATE TABLE puzzle_themes(
  puzzle_id TEXT REFERENCES puzzles(id) ON DELETE CASCADE,
  theme TEXT,
  PRIMARY KEY(puzzle_id, theme)
);
CREATE INDEX idx_themes_theme ON puzzle_themes(theme);

CREATE TABLE progress (
  puzzle_id TEXT PRIMARY KEY REFERENCES puzzles(id) ON DELETE CASCADE,
  solved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  attempts INTEGER DEFAULT 1,
  hints_used INTEGER DEFAULT 0
);
-- Single-user: no users table. Future multi-user: users(id) + progress(user_id, puzzle_id) PK.
```

Filter mapping:
- `bucket` (`chess-coach.html:272` `any/easy/medium/hard/expert` via `bucketOf():650`) -> `WHERE rating BETWEEN :min AND :max`
- `themes/type` -> `WHERE id IN (SELECT puzzle_id FROM puzzle_themes WHERE theme IN (...))`
- `q` -> `WHERE id LIKE '%q%' OR themes LIKE '%q%'`
- `status` -> `LEFT JOIN progress p ON p.puzzle_id = puzzles.id WHERE p.solved_at IS NOT NULL / IS NULL`

## 5. Worker
`wrangler.toml`:
```toml
name = "chess-coach-api"
main = "worker.js"
compatibility_date = "2025-09-17"

[[d1_databases]]
binding = "DB"
database_name = "chess-coach"
database_id = "<from wrangler d1 create chess-coach>"
```

Routes (approx 80 lines `worker.js`):
- `GET /api/puzzles` — paginated `LIMIT 50`, honors filters above, returns `[{id,rating,fen,playerColor,solution,themes}]`.
- `POST /api/puzzles` — validates `fen` via `chess.js` `new Chess(fen).fen()` and replays `solution` (reuse `handlePuzzleUserMove:722` slice logic), inserts `puzzles` + `puzzle_themes` in batch.
- `GET /api/progress` / `POST /api/progress {puzzle_id}` — upsert `progress`.
- CORS headers + `OPTIONS` handling.

Seed:
- `scripts/seed-d1.mjs` reads `chess-coach.html:353` inline array (or `puzzles.json`) and inserts 48 + `puzzle_themes` via `wrangler d1 execute chess-coach --file=seed.sql`.
- `scripts/import-puzzles.mjs` for larger Lichess CSV import (dedupes `id`, validates `fen/solution`).

## 6. Frontend Changes (files)
- `chess-coach.html:350-353`:
  ```js
  let PUZZLES = [];
  async function loadPuzzles(){
    try { PUZZLES = await fetch(WORKER_URL+"/api/puzzles").then(r=>r.json()); }
    catch { PUZZLES = EMBEDDED_FALLBACK; } // keep current 48 inline as fallback
  }
  ```
- `chess-coach.html:700-720` `loadRandomPuzzle()` -> `pool = applyFilters(PUZZLES, {bucket,themes,q,status})` using in-memory `Map<theme,Set<id>>` built once (fast for <2k; switch to server query >5k).
- `chess-coach.html:272-286` extend `puzzleDiff` dropdown to chips: rating bucket + `themes` multi-select + text input `q` + toggle `All / Unsolved / Solved`; new `puzzleListEl` card shows `★ solved` + counts.
- `chess-coach.html:722,776,657` on `puzzleSolved=true`:
  ```js
  fetch(WORKER_URL+"/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({puzzle_id: currentPuzzle.id})});
  localStorage.setItem("chess-coach:progress:v1", JSON.stringify(progressMirror));
  ```
  Mirror to `localStorage chess-coach:cache:puzzles` for offline.
- `Add Puzzle` modal in `.puzzle-only:269` -> `POST /api/puzzles` (fen/solution/rating/themes form, validated with `Chess(fen)`).
- Keep `index.html` sync — either `Copy-Item chess-coach.html index.html` script or switch `vercel.json` to `{"rewrites":[{"source":"/","destination":"/chess-coach.html"}]}` to avoid drift.

## 7. Execution Steps
1. `wrangler d1 create chess-coach` -> paste `database_id` into `wrangler.toml`.
2. `wrangler d1 execute chess-coach --file=schema.sql` (tables above).
3. `node scripts/seed-d1.mjs` (48 rows + themes).
4. Implement `worker.js` + CORS.
5. Refactor `chess-coach.html` `loadPuzzles` / `applyFilters` / filter UI / progress sync.
6. Add `Add Puzzle` modal.
7. `wrangler deploy` -> set `WORKER_URL` in `chess-coach.html`.
8. Push to `main` -> Vercel auto-deploys (`vercel.json` `cleanUrls`).

## 8. Verification (browser per AGENTS.md:7)
- Cold load Vercel -> Worker `GET /api/puzzles` returns 48, list renders; fallback renders if Worker down.
- Filter `easy + mateIn1` -> correct subset; `Unsolved` excludes `JOIN progress` rows.
- Solve puzzle -> refresh -> still `✓ Solved` (`progress` row + `localStorage` match).
- Add via modal -> `SELECT` finds it, reload without git push, persists.
- Offline (Worker blocked) -> cached puzzles + queued progress; no page-scroll regression (`chess-coach.html:891` container-only scroll).

## 9. Open Questions
1. Keep Vercel frontend + Worker API (CORS) or move frontend to Cloudflare Pages/Worker too?
2. Public `POST /api/puzzles` (anyone with URL can add) or gate with `X-API-Key` Worker secret now?
3. Worker subdomain (`chess-coach-api.<you>.workers.dev`) vs custom `api.yoursite.com`?
4. Seed only current 48 or import larger Lichess dump (hundreds)?
5. Need daily backup of D1 (`wrangler d1 export`) or Vercel cron?

---
*Generated 2026-09-17 for D:\Projects\chess-coach — single-file static browser app (`AGENTS.md`).*
