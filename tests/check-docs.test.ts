import { describe, expect, it } from "vitest";
import { findDocProblems } from "../scripts/check-docs.mjs";

const finished = (): Record<string, string> => ({
  "README.md": "# Gate",
  "SECURITY.md": "Report to the maintainer.",
  "CHANGELOG.md": "# Changelog\n\n## Unreleased\n",
  ".claude/CLAUDE.md": "# CLAUDE.md",
  LICENSE: "MIT",
});

const without = (files: Record<string, string>, ...names: string[]) =>
  Object.fromEntries(Object.entries(files).filter(([name]) => !names.includes(name)));

// Runs the check against an in-memory set of files.
function check(files: Record<string, string>, release = false) {
  return findDocProblems({
    exists: (file) => file in files,
    // eslint-disable-next-line security/detect-object-injection -- lookup in the test's own fixture
    read: (file) => files[file] ?? "",
    release,
  });
}

describe("findDocProblems", () => {
  it("passes finished docs, also for a release", () => {
    expect(check(finished())).toEqual([]);
    expect(check(finished(), true)).toEqual([]);
  });

  it.each(["README.md", "SECURITY.md", ".claude/CLAUDE.md"])("reports a missing %s", (file) => {
    expect(check(without(finished(), file))).toEqual([`${file} is missing`]);
  });

  it("reports a missing CHANGELOG.md and its missing Unreleased section", () => {
    expect(check(without(finished(), "CHANGELOG.md"))).toEqual([
      "CHANGELOG.md is missing",
      'CHANGELOG.md needs an "## Unreleased" section',
    ]);
  });

  it("reports a changelog without an Unreleased section", () => {
    const files = { ...finished(), "CHANGELOG.md": "# Changelog\n\n## 1.0.0\n" };
    expect(check(files)).toEqual(['CHANGELOG.md needs an "## Unreleased" section']);
  });

  it("accepts placeholders and no licence before a release", () => {
    const files = without({ ...finished(), "README.md": "_To be written._" }, "LICENSE");
    expect(check(files)).toEqual([]);
  });

  it.each(["_To be written._", "_Contact details to be added_"])(
    "reports the placeholder %s for a release",
    (placeholder) => {
      const files = { ...finished(), "SECURITY.md": placeholder };
      expect(check(files, true)).toEqual(["SECURITY.md still contains placeholder text"]);
    },
  );

  it("reports a missing licence for a release", () => {
    expect(check(without(finished(), "LICENSE"), true)).toEqual(["LICENSE is missing"]);
  });
});
