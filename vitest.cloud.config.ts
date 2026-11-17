import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['tests/integration/**/*.test.ts'], setupFiles: ['tests/unit/setup.ts'], testTimeout: 60000 },
});
