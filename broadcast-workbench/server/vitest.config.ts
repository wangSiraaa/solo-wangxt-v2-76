import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Nest 依赖 decorator metadata，esbuild 不支持，改用 swc 转译
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
