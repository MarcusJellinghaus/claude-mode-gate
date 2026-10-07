/** Architecture rules. See CLAUDE.md, "Architecture rules". */
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
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
  },
};
