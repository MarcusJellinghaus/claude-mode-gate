# Supervisor skills: make review loops converge in fewer rounds

Target repository: `MarcusJellinghaus/mcp_coder` (local clone `~/Documents/VSCC/mcp_coder_1179`). Drafted from experience in `claude-mode-gate`. This issue is self-contained.

## Context

mcp-coder has three supervisor skills under `.claude/skills/`: `issue_analyse_supervisor`, `plan_review_supervisor` and `implementation_review_supervisor`. Each is a "technical lead" that does no work itself. It launches a fresh engineer subagent to review something, triages the findings, sends fixes to a specialist agent (`issue-updater`, `commit-pusher`, and so on), and loops until a round produces no changes. A safety valve stops after 5 rounds and hands the open items to the user.

In `claude-mode-gate` we applied the same pattern by hand to review 11 draft GitHub issues for being self-contained. Each round had a fresh read-only reviewer, a triage by the supervisor, and an editor subagent applying the fixes. The reviewers acted as a new LLM session handed only one issue plus the repo.

Results so far (9 October 2026):

| Draft issue | Rounds to "ready" | Nature of the findings                                                                              |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 01 spike    | 8                 | Early rounds: missing docs location, evidence standard. Later: definitions, status mapping.         |
| 02 config   | 8                 | Early: real design gaps (where config lives, grammar limits). Later: result shapes, shared types.   |
| 03 policy   | 7                 | Four rounds on one matching algorithm (security-relevant), then malformed input and contradictions. |

About two thirds of the rounds found real gaps, such as rules that looked active but were inert. The rest was avoidable convergence cost.

## What slowed convergence

1. **Incremental reporting.** A fresh reviewer reports the most visible handful of problems, so the next reviewer finds the next handful. One algorithm was fixed in four rounds, one hole at a time.
2. **No severity bar at the start.** The first reviewers listed nits, which kept the verdict at "not ready". A bar added in round 4 ("report only if a wrong guess gives an incompatible or insecure result, or a stall") cut the findings sharply.
3. **Fresh reviewers do not know what is settled.** They re-raised decided points until they were given a "decisions already made" list.
4. **Fixes broke other things.** An editor that trimmed text dropped a shared type another draft depended on. A wrong instruction from the supervisor produced a wrong status mapping. Each cost a round.
5. **Coupled documents.** Drafts that share contracts (types, result shapes) reopened each other's gaps, and consistency was only checked through the next reviewer.
6. **Patching in small batches.** Related findings went to the editor one round at a time.
7. **A wrong first brief.** The initial drafts were short and linked to the design. The requirement ("self-contained for a fresh session") came later and forced a full rewrite.

## What worked

- A severity bar in the reviewer prompt.
- A "decisions already made" list passed to every fresh reviewer.
- A review log with findings, decisions and changes per round.
- Escalating only real owner decisions (one question at a time with A/B/C options) and fixing everything else autonomously.
- Accepting "no blocker, no insecure or incompatible gap" as done, and logging the accepted nits.

## Proposed changes to the supervisor skills

1. **Exhaustive single pass.** The reviewer prompt says: list every finding that meets the bar in this one report, and do not stop at the first few.
2. **Severity bar in the template.** Report only findings where a wrong guess would give an incompatible or insecure result, or a stall. Exclude style and easy-to-infer detail.
3. **Pass settled context to every fresh reviewer.** The supervisor builds a "decisions already made" block and a "shared contracts" block (types, result shapes, owned-by-which-document) and includes them in each reviewer and editor prompt. It updates the blocks as the user answers questions.
4. **Batch related findings.** When several findings belong to one cluster, send one editor the whole cluster. For algorithmic rules, ask for the complete specification with a test table in one pass.
5. **Editor consistency pass.** After editing, the editor re-reads every coupled document and reports contradictions before the next review.
6. **Stop criterion.** Done means no blocker and no insecure or incompatible gap. Nice-to-have items are logged as accepted nits and do not trigger another round.
7. **Adaptive bar.** If two consecutive rounds find only definitional gaps, tighten the bar automatically. The safety valve stays, with the open items shown to the user.
8. **Reviewer memory.** Fresh reviewers avoid anchoring but forget. Evaluate resuming one reviewer (or passing it the list of already-raised and resolved findings) against fresh ones.
9. **Two lenses.** Evaluate two parallel reviewers per round, one for semantics and security and one for cross-document consistency.
10. **Supervisor discipline.** The supervisor does not write fix instructions from memory without checking them against the text. It states the intended result and lets the editor verify.

## Out of scope

- Changing the issue workflow, status labels or the specialist agents.
- Replacing the supervisor pattern.

## Acceptance criteria

- [ ] The reviewer and editor prompt templates in the three supervisor skills contain: the exhaustive-pass instruction, the severity bar, and the decisions and contracts blocks.
- [ ] The supervisor skill text describes building and updating those blocks.
- [ ] The stop criterion and the logged-accepted-nits rule are in each skill.
- [ ] The editor template includes the consistency pass.
- [ ] Rounds per item are recorded in the review log, with findings by severity.
- [ ] On at least three real runs, the median rounds to done is at most 4, compared with the baseline above (7 to 8). Report the measurements in the issue.

## How to start

1. Read the three `SKILL.md` files under `.claude/skills/`, the agents under `.claude/agents/`, and `docs/repository-setup/agent-permissions.md`.
2. Change `issue_analyse_supervisor` first. Run it on one real issue and compare the number of rounds with the baseline.
3. Port the changes to `plan_review_supervisor` and `implementation_review_supervisor` if the first run improves.
4. Keep the changes small (KISS): prompt text and one new block per prompt, not new machinery.
