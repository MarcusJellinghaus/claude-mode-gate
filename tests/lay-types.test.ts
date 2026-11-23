import { describe, expect, it, vi } from "vitest";
import { claudeEnv, layTypes } from "../scripts/lay-types.mjs";

describe("claudeEnv", () => {
  it("keeps the environment and adds a placeholder key so no model is called", () => {
    const env = claudeEnv({ PATH: "/bin" });
    expect(env["PATH"]).toBe("/bin");
    expect(env["ANTHROPIC_API_KEY"]).toMatch(/^sk-ant-placeholder/);
  });

  it("asks Claude Code to watch the plugin folder, which 2.1.323 and newer need to lay the types", () => {
    expect(claudeEnv({})["CLAUDE_CODE_PLUGIN_DIR_WATCH"]).toBe("1");
  });
});

describe("layTypes", () => {
  it("does nothing when the engine types are already there", () => {
    const run = vi.fn(() => 0);
    expect(layTypes({ exists: () => true, run })).toEqual({ ok: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("lets Claude Code load the mod when the types are missing, whatever its exit code", () => {
    let laid = false;
    const run = vi.fn(() => {
      laid = true;
      return 1;
    });
    expect(layTypes({ exists: () => laid, run })).toEqual({ ok: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs again when forced, even if the types are there", () => {
    const run = vi.fn(() => 0);
    expect(layTypes({ exists: () => true, run, force: true })).toEqual({ ok: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it("fails when the types are still missing after the run", () => {
    const result = layTypes({ exists: () => false, run: () => 0 });
    expect(result.ok).toBe(false);
  });
});
