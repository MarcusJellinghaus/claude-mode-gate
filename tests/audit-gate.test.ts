import { describe, expect, it } from "vitest";
import { findBlocking } from "../scripts/audit-gate.mjs";

const advisory = (id: string, severity: string) => ({
  source: 1,
  name: "braces",
  severity,
  url: `https://github.com/advisories/${id}`,
});

// Shaped like `npm audit --json`: a package lists its own advisories as objects
// and the packages it inherits from as plain names.
const report = (...advisories: ReturnType<typeof advisory>[]) => ({
  vulnerabilities: {
    braces: { name: "braces", via: advisories },
    micromatch: { name: "micromatch", via: ["braces"] },
  },
});

const allowed = [{ id: "GHSA-aaaa-aaaa-aaaa", reason: "no fix", issue: 2 }];

describe("findBlocking", () => {
  it("passes an allowlisted high advisory", () => {
    const result = findBlocking(report(advisory("GHSA-aaaa-aaaa-aaaa", "high")), allowed);
    expect(result).toEqual({ blocking: [], stale: [] });
  });

  it("blocks a high advisory that is not allowlisted", () => {
    const result = findBlocking(report(advisory("GHSA-bbbb-bbbb-bbbb", "high")), allowed);
    expect(result.blocking).toEqual(["GHSA-bbbb-bbbb-bbbb"]);
  });

  it("blocks a critical advisory that is not allowlisted", () => {
    const result = findBlocking(report(advisory("GHSA-cccc-cccc-cccc", "critical")), []);
    expect(result.blocking).toEqual(["GHSA-cccc-cccc-cccc"]);
  });

  it("ignores moderate advisories", () => {
    const result = findBlocking(report(advisory("GHSA-dddd-dddd-dddd", "moderate")), []);
    expect(result).toEqual({ blocking: [], stale: [] });
  });

  it("reports an allowlist entry that matches nothing as stale", () => {
    const result = findBlocking(report(), allowed);
    expect(result.stale).toEqual(["GHSA-aaaa-aaaa-aaaa"]);
  });

  it("does not report a moderate advisory as a match for its allowlist entry", () => {
    const result = findBlocking(report(advisory("GHSA-aaaa-aaaa-aaaa", "moderate")), allowed);
    expect(result.stale).toEqual(["GHSA-aaaa-aaaa-aaaa"]);
  });

  it("reports each blocking advisory once", () => {
    const twice = report(
      advisory("GHSA-bbbb-bbbb-bbbb", "high"),
      advisory("GHSA-bbbb-bbbb-bbbb", "high"),
    );
    expect(findBlocking(twice, []).blocking).toEqual(["GHSA-bbbb-bbbb-bbbb"]);
  });
});
