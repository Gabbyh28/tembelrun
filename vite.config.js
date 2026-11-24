import { defineConfig } from 'vite';
// Relative base so the build works on GitHub Pages or any static host.
// __BUILD__ is stamped into asset URLs so phones never keep a stale atlas.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  build: { chunkSizeWarningLimit: 1200 },
});
