# Chess Coach

- This is a single-page static app. `index.html` is the complete entrypoint (Vite's default entry) and contains the markup, CSS, embedded puzzle data, and JavaScript. There is no framework and no server code.
- Toolchain is Vite 8 only: `npm install`, `npm run dev` (http://localhost:5173), `npm run build` → `dist/`, `npm run preview` (http://localhost:4173). Keep the tooling minimal — no framework, no test runner, no type layer unless explicitly requested.
- Board art lives in `public/assets/{chess,chess_green,chess_pink}/` and is copied verbatim into `dist/assets/`. Reference it with **absolute** `/assets/...` URLs only; a relative `assets/...` path works in dev but 404s in the build (Vite moves the inline CSS to `dist/static/`). `npm run check:assets` enforces this and also asserts each theme ships its full piece set.
- Vite bundles go to `dist/static/` (`build.assetsDir`), deliberately separate from the un-hashed art in `dist/assets/`. Do not point `assetsDir` back at `assets`.
- Vercel deploys via its Git integration (no GitHub Actions workflow, no secrets): `vercel.json` sets `npm ci`, build `npm run verify`, output `dist/`. `npm run verify` = asset gate → build → asset gate on `dist/`, so a broken asset path fails the deploy instead of shipping.
- The only external runtime dependency is chess.js 0.10.3 loaded from cdnjs (global `Chess`), so browser smoke tests require network access. It is not bundled on purpose.
- The app owns one `Chess` instance inside an IIFE. Play mode tracks FEN/move history for live-position navigation; puzzle mode reuses the same instance with an embedded solution sequence.
- Hints and AI moves run synchronously on the UI thread with an on-device negamax search (hint depth 3; AI depth 1/2/3). Keep search work small and verify responsiveness after engine changes.
- Board themes (default/green/pink) are CSS token blocks keyed on `<html data-board>`; JS only maps a theme id to an asset folder. Keep the board theme independent of the UI light/dark theme.
- For browser smoke tests, cover Play and Puzzles, a legal move, hint rendering, AI response, history navigation, undo, promotion, board flipping, and the theme switcher (including persistence across reload).
