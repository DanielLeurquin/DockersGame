import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: process.env.PAGES_BASE || '/', server: { proxy: { '/api/online': 'http://127.0.0.1:8787' } }, test: { include: ['tests/**/*.test.ts'] } });
