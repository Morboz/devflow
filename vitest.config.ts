import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests share one Postgres DB (devflow_test); run files
    // serially so their beforeEach truncations don't race each other.
    fileParallelism: false,
  },
});
