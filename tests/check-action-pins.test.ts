import { describe, expect, it } from "vitest";
import { findUnpinned } from "../scripts/check-action-pins.mjs";

const sha = "11bd71901bbe5b1630ceea73d27597364c9af683";

describe("findUnpinned", () => {
  it("accepts an action pinned to a full SHA", () => {
    expect(findUnpinned(`- uses: actions/checkout@${sha} # v4.2.2`)).toEqual([]);
  });

  it.each([
    ["a tag", "actions/checkout@v4"],
    ["a branch", "actions/checkout@main"],
    ["a short SHA", "actions/checkout@11bd719"],
    ["a 39-character SHA", `actions/checkout@${sha.slice(1)}`],
    ["a 41-character SHA", `actions/checkout@${sha}0`],
    ["no ref", "actions/checkout"],
  ])("reports %s", (_name, ref) => {
    expect(findUnpinned(`      - uses: ${ref}`)).toEqual([ref]);
  });

  it("reports an action in a step with a name", () => {
    expect(findUnpinned(`        uses: lycheeverse/lychee-action@v2`)).toEqual([
      "lycheeverse/lychee-action@v2",
    ]);
  });

  it("ignores local and docker actions", () => {
    expect(findUnpinned("- uses: ./.github/actions/x\n- uses: docker://alpine:3")).toEqual([]);
  });

  it("reports an unpinned action written in quotes", () => {
    expect(findUnpinned(`- uses: "actions/checkout@v4"`)).toEqual(["actions/checkout@v4"]);
  });

  it("returns every offender in order", () => {
    const text = `- uses: a/b@v1\n- uses: c/d@${sha}\n- uses: e/f@v2`;
    expect(findUnpinned(text)).toEqual(["a/b@v1", "e/f@v2"]);
  });

  it("does not match the word uses inside other text", () => {
    expect(findUnpinned("# uses: a/b@v1 is bad\n- run: echo uses: x")).toEqual([]);
  });
});
