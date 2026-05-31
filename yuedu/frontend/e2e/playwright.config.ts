import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      executablePath: '/tmp/chrome-extracted/opt/google/chrome/chrome',
      args: ['--no-sandbox', '--disable-gpu'],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: '/tmp/chrome-root/usr/lib/x86_64-linux-gnu',
      },
    },
  },
  webServer: [
    {
      command: 'npm run dev',
      port: 5173,
      cwd: '../',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev',
      port: 3001,
      cwd: '../../server',
      reuseExistingServer: true,
    },
  ],
})
