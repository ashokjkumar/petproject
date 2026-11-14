import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { globalSetup: ["apps/web/test/start-api.ts"], testTimeout: 20_000, exclude: ["**/node_modules/**", "**/dist/**", "**/android/**", "**/ios/**"] },
});
