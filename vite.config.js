import { defineConfig } from 'vite';

// Repo project pages: /nama-repo/ ; root pages: /
// GitHub Actions sets VITE_BASE_PATH, or Vite can derive it from repository name.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: 'dist' },
});
