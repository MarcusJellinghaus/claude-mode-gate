import { describe, expect, it } from "vitest";
import { BASH_METACHARACTERS, decide } from "../hooks/policy";
import { BASH_CHAIN_ROWS, BASH_TABLE } from "./fixtures/policy/bash";
import type { ChainRow, Row } from "./fixtures/policy/builders";
import { CORE_CHAIN_ROWS, CORE_TABLE } from "./fixtures/policy/core";
import { SUBAGENT_CHAIN_ROWS, SUBAGENT_TABLE } from "./fixtures/policy/subagent";

const ROWS: Row[] = [...CORE_TABLE, ...BASH_TABLE, ...SUBAGENT_TABLE];
const CHAIN_ROWS: ChainRow[] = [...CORE_CHAIN_ROWS, ...BASH_CHAIN_ROWS, ...SUBAGENT_CHAIN_ROWS];
const SOURCES = ["rule", "guard", "subagent-bash", "bash-downgrade", "malformed", "claude-code"];

const commandOf = (value: unknown): unknown =>
  typeof value === "object" && value !== null && "command" in value ? value.command : undefined;

// Malformed input or an unknown Claude Code decision, judged from the row itself.
const isMalformedOrUnknown = ({ input: { call, claude } }: Row): boolean => {
  const { toolName } = call;
  const badName = typeof toolName !== "string" || toolName === "";
  const badBash = toolName === "Bash" && typeof commandOf(call.input) !== "string";
  const { decision } = claude;
  const badDecision = typeof decision !== "string" || !["allow", "ask", "deny"].includes(decision);
  return badName || badBash || badDecision;
};

describe("BASH_METACHARACTERS", () => {
  it("lists exactly the shell metacharacters", () => {
    expect(BASH_METACHARACTERS).toStrictEqual(["&", ";", "|", "$", "(", ")", "`", "<", ">", "\n"]);
  });

  it("does not contain a backslash or a carriage return", () => {
    expect(BASH_METACHARACTERS).not.toContain("\\");
    expect(BASH_METACHARACTERS).not.toContain("\r");
  });
});

describe("decide", () => {
  it.each(ROWS)("$name", ({ input: row, expected }) => {
    expect(decide(row)).toStrictEqual(expected);
  });
});

describe("decide invariants", () => {
  it.each(ROWS)("$name: reports a known source", ({ input: row }) => {
    expect(SOURCES).toContain(decide(row).source);
  });

  it.each(ROWS)("$name: has no chain key without withChain", ({ input: row }) => {
    expect(Object.keys(decide(row))).not.toContain("chain");
  });

  it.each(ROWS)("$name: decides the same with withChain", ({ input: row, expected }) => {
    const { chain, ...decision } = decide({ ...row, withChain: true });
    expect(chain).toBeInstanceOf(Array);
    expect(decision).toStrictEqual(expected);
  });

  it.each(ROWS.filter(isMalformedOrUnknown))("$name: never allows", ({ input: row }) => {
    expect(decide(row).verdict).not.toBe("allow");
  });
});

describe("decide chain", () => {
  it.each(CHAIN_ROWS)("$name", ({ input: row, chain }) => {
    expect(decide({ ...row, withChain: true }).chain).toStrictEqual(chain);
  });
});
