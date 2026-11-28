import type { LoadDeps } from "../hooks/config";

export const USER_CONFIG = "/home/u/mode-gate.json";

// The reader: a string resolves, an Error rejects, an absent path is a missing file.
export function fakeDeps(
  files: Record<string, string | Error>,
  overrides: Partial<LoadDeps> = {},
): LoadDeps {
  const readFile = (path: string): Promise<string | undefined> => {
    if (!Object.hasOwn(files, path)) return Promise.resolve(undefined);
    // eslint-disable-next-line security/detect-object-injection -- own key, checked above
    const content = files[path];
    return content instanceof Error ? Promise.reject(content) : Promise.resolve(content);
  };
  return {
    readFile,
    env: { MODE_GATE_CONFIG: USER_CONFIG },
    untrustedEnv: [],
    cwd: "/repo",
    baseline: { allow: ["Edit"] },
    builtins: {
      "git-write": { description: "g", delegable: true, allow: [], ask: [], deny: [] },
    },
    ...overrides,
  };
}
