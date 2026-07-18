import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/js/**/*.test.js'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/js/vitest.setup.js'],
  },
});