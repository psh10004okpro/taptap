// 단일 파일 데모 빌드 (아티팩트/단일 HTML 배포용) — 일반 빌드는 vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
