# Guards: protected paths and the subagent Bash redirect

## Goal

Stop Claude from rewriting the mod or its settings, and steer denied Bash calls to the approved tool. Both guards are part of `decide()` and wired in `tool.call`.

## Scope

- Deny Edit and Write on the mod's config and source, `settings*.json`, hooks, shell profiles and the log folder.
- Ask for the rest of `.claude/`.
- Resolve relative paths and `..` before matching.
- Document the known gap: PowerShell, NotebookEdit, MCP file tools and symlinks.
- Subagent Bash with no rule: deny with a redirect message.
- A hint table maps common Bash commands (for example `git status`, `cat`) to the approved MCP tool.

## Acceptance criteria

- [ ] Tests exist first, with a negative row for each protected path.
- [ ] `../` and `./a/../.claude/settings.json` style paths are denied.
- [ ] The rest of `.claude/` returns ask, not allow.
- [ ] A subagent Bash call returns deny with a message naming the MCP tool to use.
- [ ] A Bash command not in the hint table gets a generic redirect.
- [ ] The known gap is listed in the README and in SECURITY.md.
- [ ] A baseline protected path cannot be unlocked by any profile.

## Depends on

Draft 03, Draft 04

## References

- [Protected paths](../design.md#protected-paths)
- [Decision order](../design.md#decision-order)
- [Security model](../design.md#security-model)
- [Goals and non-goals](../design.md#goals-and-non-goals)
