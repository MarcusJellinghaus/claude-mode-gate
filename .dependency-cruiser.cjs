/** Architecture rules. See .claude/CLAUDE.md, "Architecture rules". */
module.exports = {
  forbidden: [
    {
      name: "policy-is-pure",
      comment: "policy.ts is pure decision logic: it may import nothing.",
      severity: "error",
      from: { path: "^hooks/policy\\.ts$" },
      to: {},
    },
    {
      name: "no-import-of-register",
      comment: "register.ts is the wiring entry point. Nothing may import it, not even tests.",
      severity: "error",
      from: {},
      to: { path: "^hooks/register\\.ts$" },
    },
    {
      name: "production-code-never-imports-tests",
      severity: "error",
      from: { path: "^(hooks|types)/" },
      to: { path: "^tests/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-dev-dependencies-in-hooks",
      comment: "Shipped hook code must not depend on devDependencies.",
      severity: "error",
      from: { path: "^hooks/" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "data-files-import-only-policy",
      comment:
        "baseline.ts and builtin-profiles.ts hold data: they may import only types from policy.ts.",
      severity: "error",
      from: { path: "^hooks/(baseline|builtin-profiles)\\.ts$" },
      to: { pathNot: "^hooks/policy\\.ts$" },
    },
    {
      name: "data-files-no-runtime-imports",
      severity: "error",
      from: { path: "^hooks/(baseline|builtin-profiles)\\.ts$" },
      to: { dependencyTypesNot: ["type-only"] },
    },
    {
      name: "config-imports-only-its-modules",
      comment: "config.ts may import only policy.ts, baseline.ts and builtin-profiles.ts.",
      severity: "error",
      from: { path: "^hooks/config\\.ts$" },
      to: { pathNot: "^hooks/(baseline|builtin-profiles|policy)\\.ts$" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
  },
};
