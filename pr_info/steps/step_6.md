# Step 6: Boy Scout docs

## LLM prompt

> Read `pr_info/steps/summary.md`, then implement `pr_info/steps/step_6.md` exactly. Steps 1 to 5 are done and `decide` is complete. This step changes documentation only. Edit with `edit_file`. Keep each change short and in the surrounding style. Then run `npm run format`, `npm run check`, and commit `.claude/CLAUDE.md` and `docs/design.md` with `git_commit` (`paths`), message `docs: align design and testing strategy with decide()`. If `edit_file` refuses `.claude/CLAUDE.md` or `docs/design.md`, write one line to `pr_info/.blocked.txt` naming the file and stop.

## WHERE

- `.claude/CLAUDE.md`, section "Testing strategy"
- `docs/design.md`, sections "Decision order", "Matching" and "Testing"

## WHAT

`.claude/CLAUDE.md`, Testing strategy, item 3:

- "one row per case, with the call, the mode and the expected verdict" → "one row per case, with the call, the active rule sets, the guard results, Claude Code's verdict and the expected decision".
- Delete the bullet "protected paths, including relative paths and `..`;" (they are tested with the guards, Draft 05).

`docs/design.md`, Decision order:

- First paragraph: Claude Code's verdict arrives as `{ decision, reason, rule, setting, hook, plugin }` (the six fields), not `{ decision, reason, rule }`. Add one sentence: an unknown `decision` (anything but exactly `allow`, `ask` or `deny`, a missing one included) is never passed through; it is handled like malformed input after the denies, so any matching deny still wins.
- Step 2: "A covered write tool targets a protected path: deny." → "A `deny` guard result (protected paths; an invalid subagent assignment): deny."
- After the paragraph "An allow from Claude Code is downgraded…", add a short paragraph on protected asks: an allow rule overrides only a plain Claude Code ask; an ask that carries `setting`, `hook` or `plugin` (present, the empty string included) is passed through instead, while deny rules and deny guard results still win and ask rules still ask; an ask from a tool's own check carries none of the three and stays overridable (documented limit).

`docs/design.md`, Matching:

- "Deny rules and profile ask rules use a boundary-checked substring test" → "Deny rules and ask rules use …".
- "Both tests apply to every rule, with no exception. An empty prefix always matches." → "Both tests apply to every rule with a non-empty text. The one exception is an empty rule text (`deny Bash(*)`, `ask Bash(*)`), which matches every string command."
- Add a bullet on whole-tool rules: `*` matches every tool; plain names match exactly; an allow `mcp__<server>` (no further `__`) matches every tool starting with `mcp__<server>__`; a deny or ask rule `mcp__x__y` matches the tool `mcp__x__y` and every tool starting with `mcp__x__y__`, because a server name may contain `__`; an allow rule `mcp__x__y` matches only that name.

`docs/design.md`, Testing, last sentence:

- "Policy tests are table-driven and cover the decision order, chained and substituted Bash, protected paths, fail-closed behaviour and the reset after `/clear`." → "Policy tests are table-driven and cover the decision order and Bash matching (chained and substituted commands included) and fail toward ask on unknown input. Protected paths are tested with the guards (Draft 05), the reset after `/clear` with the wiring."

## HOW

Do not touch the Decision log section (its `rule` field belongs to #9), README.md or CHANGELOG.md (docs-only change).

## ALGORITHM

None (documentation only).

## DATA

None.

## Tests

None new; `npm run docs:lint` and `npm run format:check` run inside `npm run check`.
