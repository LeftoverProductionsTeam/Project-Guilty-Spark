import { defineConfig } from 'vitest/config';
if (!process.env.SPARK_GENERATED_ROOT) throw new Error('Use scripts/frontend-tests.mjs unit for disposable test output.');
export default defineConfig({ cacheDir: `${process.env.SPARK_GENERATED_ROOT}/vitest-cache`, test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] } });
