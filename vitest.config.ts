import { defineConfig } from "vitest/config";

// Standalone config (not vite.config.ts) so tests don't load the PWA/Tailwind
// plugins. Tests are pure and offline; browser globals are stubbed per test.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
