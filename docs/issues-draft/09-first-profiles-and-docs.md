# First profiles and README

## Goal

Ship two useful profiles and the documentation that tells users what the mod can and cannot do.

## Scope

- `git-write`: Bash prefix rules for `git add`, `git commit`, `git push` and `git checkout -b`.
- `issues`: the mcp-workspace GitHub issue and PR write tools.
- Decide which profiles are non-delegable, and record it.
- README sections "what it can reach" and "what it allows".
- Usage examples: `/gate-on git-write`, `MODE_GATE_PROFILES=issues,git-write`, `/gate-why`.

## Acceptance criteria

- [ ] Both profiles pass `/gate-check` with no findings.
- [ ] `git commit -m x && rm -rf .` does not match `git-write` (negative test).
- [ ] `git push --force` is considered: allowed, asked or denied is decided and tested.
- [ ] The `issues` profile lists exact tool names, verified against mcp-workspace.
- [ ] The non-delegable decision is in `docs/design.md`.
- [ ] README states the permission-mode limit and the known write-route gap.
- [ ] README examples run as written.
- [ ] `npm run check:docs` and `npm run docs:lint` pass.
- [ ] CHANGELOG.md is updated.

## Depends on

Draft 02, Draft 03, Draft 04, Draft 05

## References

- [Baseline](../design.md#baseline)
- [Open items](../design.md#open-items)
- [Protected paths](../design.md#protected-paths)
- [Permission modes](../design.md#permission-modes)
- [Prior art](../design.md#prior-art)
