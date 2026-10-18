#!/usr/bin/env node
/**
 * Asset integrity gate for Chess Coach.
 *
 *   node scripts/check-assets.mjs          # check the source tree (pre-build)
 *   node scripts/check-assets.mjs --dist   # check the built output (post-build)
 *
 * Guards the failure mode that shipped a 404 to production: a board-art or piece
 * path that does not resolve to a real file, or a *relative* "assets/..." path.
 * Relative paths work in dev but break once Vite extracts the CSS out of
 * index.html into dist/static/ (the URL then resolves against /static/).
 *
 * Exits non-zero with a list of problems. No dependencies — runs on plain Node.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkDist = process.argv.includes('--dist');

// index.html lives at the repo root in source, but /assets/... URLs are served
// from public/ in dev and from dist/ once built — so the two roots differ.
const htmlPath = checkDist ? join(root, 'dist', 'index.html') : join(root, 'index.html');
const assetRoot = checkDist ? join(root, 'dist') : join(root, 'public');
const baseDir = assetRoot;

const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(htmlPath)) {
  console.error(`check-assets: ${htmlPath} not found${checkDist ? ' — run `npm run build` first' : ''}`);
  process.exit(1);
}

const rawHtml = readFileSync(htmlPath, 'utf8');

// Strip comments first: the file documents the art paths in prose, and those
// mentions must not be mistaken for real references.
const html = rawHtml
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

// ---- 1. every art reference must be absolute ---------------------------------
for (const [, rel] of html.matchAll(/(?:url\(["']?|\bsrc=["']|\bhref=["'])(assets\/[^"')]+)/g)) {
  fail(`relative path "${rel}" — use "/${rel}" (Vite cannot rewrite URLs for files in public/)`);
}

// ---- 2. every /assets/... reference must resolve to a real file --------------
const referenced = new Set(
  [...html.matchAll(/\/assets\/[^"')]+/g)]
    .map((m) => m[0].replace(/[),;]+$/, ''))
    .filter((p) => !p.endsWith('/'))
);

for (const urlPath of referenced) {
  const file = join(baseDir, urlPath.replace(/^\//, ''));
  if (!existsSync(file)) fail(`referenced asset missing: ${urlPath} → expected ${file}`);
}

// ---- 3. every board theme must ship a full, loadable piece set ---------------
const setsBlock = html.match(/BOARD_SETS\s*=\s*\{([^}]*)\}/);
if (!setsBlock) {
  fail('BOARD_SETS not found in index.html — the theme switch has no asset map');
} else {
  const sets = [...setsBlock[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)]
    .map(([, name, prefix]) => [name, prefix]);

  if (sets.length === 0) fail('BOARD_SETS is empty');

  const pieces = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const shades = ['white', 'black'];

  for (const [name, prefix] of sets) {
    const dir = join(baseDir, prefix.replace(/^\//, ''));
    if (!existsSync(dir)) {
      fail(`theme "${name}" points at a missing directory: ${prefix}`);
      continue;
    }
    const required = ['board_alt.png', ...shades.flatMap((s) => pieces.map((p) => `${s}_${p}.png`))];
    const missing = required.filter((f) => !existsSync(join(dir, f)));
    if (missing.length) fail(`theme "${name}" (${prefix}) is missing: ${missing.join(', ')}`);
  }
}

// ---- 4. build output sanity ---------------------------------------------------
let extra = '';
if (checkDist) {
  if (!existsSync(join(baseDir, 'assets'))) {
    fail('dist/assets/ missing — the board art was not copied out of public/');
  }

  const bundleDir = join(baseDir, 'static');
  if (existsSync(bundleDir)) {
    const bundles = readdirSync(bundleDir).filter((f) => /\.(js|css)$/.test(f));
    if (bundles.length) {
      extra = `, bundles: ${bundles
        .map((f) => `${f} (${Math.round(statSync(join(bundleDir, f)).size / 1024)} kB)`)
        .join(', ')}`;
    }
  } else {
    // index.html is self-contained (inline <style> and <script>), so Vite emits no
    // separate bundle. Should the app ever import modules, they will appear here.
    extra = ', self-contained index.html (no separate bundle)';
  }
}

// ---- report -------------------------------------------------------------------
if (problems.length) {
  console.error(`\ncheck-assets: ${problems.length} problem(s) in ${checkDist ? 'dist/' : 'source'}:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check-assets: OK (${checkDist ? 'dist' : 'source'}) — ${referenced.size} asset reference(s) resolve, all board themes complete${extra}`
);
