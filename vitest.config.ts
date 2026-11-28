import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["hooks/policy.ts", "hooks/config.ts"],
      reporter: ["text", "lcov"],
      // The policy and the config parser are the security boundary: each file must reach the bar on its own.
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95, perFile: true },
    },
  },
});
