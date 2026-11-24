import { describe, expect, it } from "vitest";
import { findUncaught } from "../scripts/check-gating-catch.mjs";

const caught = (event: string) => `$.on("${event}", (call) => decide(call)).catch(() => deny());\n`;
const uncaught = (event: string) => `$.on("${event}", (call) => decide(call));\n`;

describe("findUncaught", () => {
  it("passes a gating hook with a .catch", () => {
    expect(findUncaught(caught("tool.call"))).toEqual({ scanned: 1, uncaught: [] });
  });

  it.each(["tool.call", "tool.check", "prompt.submit", "command.run"])(
    "reports a %s hook without a .catch",
    (event) => {
      expect(findUncaught(uncaught(event)).uncaught).toEqual([event]);
    },
  );

  it("ignores a non-gating hook without a .catch", () => {
    expect(findUncaught(uncaught("session.start"))).toEqual({ scanned: 1, uncaught: [] });
  });

  it("does not credit a hook with the .catch of the next registration", () => {
    const source = uncaught("tool.call") + caught("tool.check");
    expect(findUncaught(source).uncaught).toEqual(["tool.call"]);
  });

  it("finds registrations with single quotes and extra spaces", () => {
    expect(findUncaught(`$.on(  'tool.call', handler);`).uncaught).toEqual(["tool.call"]);
  });

  it("accepts a .catch with a space before the parenthesis", () => {
    expect(findUncaught(`$.on("tool.call", handler).catch (deny);`).uncaught).toEqual([]);
  });

  it("reports every uncaught hook in order", () => {
    const source = uncaught("tool.call") + caught("prompt.submit") + uncaught("command.run");
    expect(findUncaught(source)).toEqual({ scanned: 3, uncaught: ["tool.call", "command.run"] });
  });

  it("scans nothing in a file without registrations", () => {
    expect(findUncaught("export const register = () => undefined;")).toEqual({
      scanned: 0,
      uncaught: [],
    });
  });
});
