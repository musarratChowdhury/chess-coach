import { defineConfig } from 'vite';

export default defineConfig({
  // Deployed at a domain root (Vercel), so asset URLs are absolute: /assets/...
  base: '/',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // Bundled JS/CSS land in dist/static/. The board art is copied verbatim from
    // public/assets/ to dist/assets/ with its original (un-hashed) names — keeping
    // the bundles in a separate folder means the two can never be confused.
    assetsDir: 'static',

    // Single-page app: no source maps or gzip-size report needed in the deploy.
    sourcemap: false,
    reportCompressedSize: false,
  },

  server: { port: 5173 },
  preview: { port: 4173 },
});
