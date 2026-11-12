import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          root: './backend/domain',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'backend',
          root: './backend',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'front',
          root: './front',
          include: ['src/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
