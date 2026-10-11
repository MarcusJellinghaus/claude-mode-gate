import { describe, expect, it, vi } from "vitest";
import { layTypes } from "../scripts/lay-types.mjs";

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
