import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2022',
    // Enable experimental decorators so NestJS @Injectable/@Inject work at test time
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        target: 'ES2022',
      },
    },
  },
  test: {
    globals: true,
    // Import reflect-metadata before every test file so NestJS DI metadata is available
    setupFiles: ['reflect-metadata'],
  },
});
