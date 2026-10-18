# Chess Coach

A single-page chess trainer: play against a small on-device engine, solve embedded
puzzles, get hints, and switch the board between three furnished art themes
(default / green / pink).

`index.html` is the entire app — markup, CSS, embedded puzzle data and the game
logic all live in that one file. Vite is used only as the dev server and bundler
for deployment; there is no framework, no server code, and no database.

## Requirements

- Node.js **>= 22.12** (Vite 8). Node 24 is what this project is developed on.
- Network access in the browser: chess.js 0.10.3 is loaded from cdnjs (global `Chess`)
  and is intentionally not bundled.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
```

## Production build

```bash
npm run build        # → dist/
npm run preview      # serve dist/ at http://localhost:4173
```

`npm run verify` runs the asset gate, builds, and re-checks the built output —
the same sequence CI runs.

## Layout

```
index.html                 the whole app (Vite entry point)
vite.config.js             build config: dist/ for output, dist/static/ for bundles
vercel.json                Vercel build settings, clean URLs, cache headers
scripts/check-assets.mjs   asset integrity gate (used by CI)
public/
  chess-coach.html         redirect from the app's former entry-point URL
  assets/
    chess/                 default theme: board_alt.png + 12 piece PNGs
    chess_green/           green theme
    chess_pink/            pink theme
    ref/                   the artist's reference compositions (not used by the app)
docs/plans/                design notes
```

### Asset rules (important)

- Everything in `public/` is copied verbatim to `dist/`. Those files keep their
  original, **un-hashed** names, so reference them with **absolute** URLs only:
  `/assets/chess/board_alt.png`.
- Never reference them relatively (`assets/...`). That works in `npm run dev` but
  breaks in the build, because Vite extracts the inline CSS out of `index.html`
  into `dist/static/` and a relative URL then resolves against `/static/`.
  `npm run check:assets` fails the build if a relative path reappears.
- Vite emits its own hashed bundles into `dist/static/` (`build.assetsDir`), so the
  bundles and the copied art can never collide or be mistaken for each other.

## Deploying to Vercel

Deployment runs through Vercel's Git integration — no GitHub Actions workflow and
no secrets to manage. `vercel.json` pins everything Vercel needs, so the dashboard
needs no manual configuration:

- install `npm ci`, build `npm run verify`, output `dist/`

### One-time setup

1. In Vercel: **Add New → Project → import this repository.**
2. Accept the detected settings (the values above come from `vercel.json`).
3. Done. Pushes to `main` deploy to production; every pull request gets its own
   preview deployment.

Because the build command is `npm run verify`, the asset gate runs *inside* the
Vercel build: a missing piece image or a relative `assets/...` path fails the
deploy instead of shipping a 404.

### Local verification

```bash
npm run verify       # asset gate → build → asset gate on dist/
```

Run this before pushing; it is exactly what Vercel runs.

## Notes

- **Board art caching:** `/static/*` is immutable for a year (Vite fingerprints
  those filenames), while `/assets/*` is cached for a day with revalidation —
  the art filenames never change, so a long immutable window would pin stale
  artwork after an asset swap.
- **Fitting new art:** the board geometry is expressed as a percentage inset of
  the art canvas (`--board-art` plus the `.board-wrap` / `.sq` dimensions), so a
  differently sized export with the same 256×256 proportions drops in without
  touching the CSS. See `docs/` and the theme notes for the measured offsets.
- **Optional next step:** chess.js could be moved from the cdnjs script tag to an
  npm dependency and bundled, removing the network requirement at runtime. It is
  deliberately not done here, to keep the app's dependency surface unchanged.
