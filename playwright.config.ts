import { defineConfig } from '@playwright/test'

// T6: real-browser verification the jsdom test suite structurally can't do
// (actual layout/overflow, tap-target box sizes). Runs against a production
// `vite preview` server at the 390x844 mobile-first design viewport.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium',
    },
  },
})
