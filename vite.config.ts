import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the same build works at the domain root (vite preview,
  // Playwright) and under a subpath (GitHub Pages /deadlock-build-optimizer-r02/).
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
