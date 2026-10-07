import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({ testDir: './e2e', fullyParallel: false, use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure', launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] } }, webServer: { command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI } });
