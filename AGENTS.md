# Chess Coach

- This is a single-file static browser app. `chess-coach.html` is the complete entrypoint and contains the markup, CSS, embedded puzzle data, and JavaScript; there is no package manager, build step, test suite, or dev-server config.
- Open `chess-coach.html` directly in a browser for local verification. The only external runtime dependency is chess.js 0.10.3 loaded from cdnjs, so browser smoke tests require network access.
- Keep changes self-contained unless a dependency or tooling change is explicitly requested. Do not invent package scripts or build tooling for this repository.
- The app owns one `Chess` instance inside an IIFE. Play mode tracks FEN/move history for live-position navigation; puzzle mode reuses the same instance with an embedded solution sequence.
- Hints and AI moves run synchronously on the UI thread with an on-device negamax search (hint depth 3; AI depth 1/2/3). Keep search work small and verify responsiveness after engine changes.
- For browser smoke tests, cover Play and Puzzles, a legal move, hint rendering, AI response, history navigation, undo, promotion, and board flipping.
