import { describe, expect, it } from "vitest";
import { findUncruised } from "../scripts/check-arch-modules.mjs";

describe("findUncruised", () => {
  it("returns nothing when every source file was cruised", () => {
    expect(
      findUncruised(["hooks/a.ts", "tests/a.test.ts"], ["hooks/a.ts", "tests/a.test.ts"]),
    ).toEqual([]);
  });

  it("reports a source file the cruise missed", () => {
    expect(findUncruised(["hooks/a.ts"], ["hooks/a.ts", "hooks/b.ts"])).toEqual(["hooks/b.ts"]);
  });

  it("reports every source file when nothing was cruised", () => {
    expect(findUncruised([], ["hooks/a.ts", "types/index.d.ts"])).toEqual([
      "hooks/a.ts",
      "types/index.d.ts",
    ]);
  });

  it("ignores backslash versus slash differences", () => {
    expect(findUncruised(["hooks\\a.ts"], ["hooks/a.ts"])).toEqual([]);
    expect(findUncruised(["hooks/a.ts"], ["hooks\\a.ts"])).toEqual([]);
  });

  it("does not report cruised files that are not source files", () => {
    expect(findUncruised(["hooks/a.ts", "node_modules/x/index.js"], ["hooks/a.ts"])).toEqual([]);
  });
});
