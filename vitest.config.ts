import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["hooks/policy.ts"],
      reporter: ["text", "lcov"],
      // The pure policy is the security boundary: hold it to a high bar once it has logic.
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
