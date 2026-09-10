# 03. Memory layers and priority

## Three layers, two owned by Alfred

```
Layer A  Alfred global      Alfred/knowledge/*.md   committed   rules, contract, conventions for every skill
                            Alfred/memory/global.md gitignored  your personal facts that apply in every project
Layer B  Workspace          <project>/.alfred/      gitignored  this project's memory, sessions, skill report cards
Layer C  Tool native        CLAUDE.md, .github/copilot-instructions.md, Claude auto-memory, Copilot memory
```

A and B are Alfred's. C belongs to the tools and to the team; Alfred never writes there.

## What goes where (the sorting rule)

Ask three questions about a fact:

1. True in every project? Then Layer A, `memory/global.md`. Example: "my branch prefix
   is `ss_`", "always use `gh`, never the GitHub web UI for PRs".
2. True only in this project, and needed by an Alfred skill later? Layer B,
   `.alfred/memory.md`. Example: "PRs target `develop`", "DB team wants snake_case".
3. Something the whole team should know, tool-agnostic, worth committing? Layer C.
   Alfred does not write it. The core rules tell the AI to say "this belongs in
   CLAUDE.md" instead of storing it.

If none of the three, do not store it. Most things in a conversation fail all three.

## Priority when an Alfred skill is running

Your rule: Alfred memory first, then tool memory and CLAUDE.md, then anything else.

How it is achieved: two ways, one hard, one soft.

Hard (ordering): the hook injects Layer A then Layer B before the skill text. The
skill text comes after. CLAUDE.md and tool memory were loaded by the tool at session
start, earlier and further away in the conversation. Recency and explicitness both
favour Alfred's text.

Soft (instruction): `knowledge/alfred-core.md` states the rule in one sentence:

```
While an Alfred skill is running, if this text or .alfred/memory.md conflicts with
CLAUDE.md, copilot-instructions, or tool memory, follow Alfred and mention the conflict
to the user once.
```

Honest limit: this is an instruction, not enforcement. No hook can delete CLAUDE.md
from the model's context. In practice conflicts are rare because Alfred memory is kept
narrow (facts skills need). When one appears, the AI is told to flag it, so you fix the
stale side.

When no Alfred skill is running, nothing Alfred-related is injected and the tool
behaves exactly as before. That is your "else follow normal structure".

## Layer A in detail

`Alfred/knowledge/alfred-core.md` (committed, about 40 lines). Contents:

- Who Alfred is in one line, and that skills come from Alfred.
- Where Layer A and Layer B live and what each file is for.
- The priority sentence above.
- Write rules: minimum, one line per fact, dated, tagged, update in place, no secrets,
  no transcripts, no code, caps.
- Session summary rules: up to 6 lines, only on a real result.
- Feedback rules: counters are not yours to edit, ratings only from the user.

Extra knowledge files can be added later (`knowledge/pr-template.md` for the roadmap's
knowledge packs idea) and a skill points at them by name. The hook injects only
`alfred-core.md` by default. Anything else is loaded on demand by the skill that needs it.

`Alfred/memory/global.md` (gitignored, cap 20 lines). Same one-line-per-fact format as
the project memory. Starts empty. Grows only when the AI meets a fact that passes
question 1 above. Today's `ship-pr` files `~/.claude/ship-pr/branch-prefix.txt` and
`target-release.txt` become two lines here, readable by Copilot too.

## Layer B in detail

```
.alfred/
  .gitignore     "*"   self-ignoring, project .gitignore never edited
  README.md      12 lines for a human or a stray model: what this is, who writes it
  memory.md      project facts, cap 40 lines
  sessions/      one file per session that produced something, newest 30 kept
  feedback/      one report card per skill used here
  .state/        hook bookkeeping, never read by the AI
```

Formats, one example each:

```
# memory.md
- [git] 2026-09-07 PRs target develop, not main
- [db] 2026-09-08 DB team wants snake_case column names
- [gotcha] 2026-09-08 PR template differs between V2Web and MO_Database, read the file
```

```
# sessions/2026-09-10-0915-claude.md
skills: pr-code-review, ship-pr

## Summary
- Reviewed PR #412 export CSV, two blocking findings, fixed in session
- Shipped ss_fix_export_nulls, PR #415
- Open: CSV date format not confirmed with product
```

```
# feedback/pr-code-review.md
uses: 14
last: 2026-09-10
rated_good: 3
rated_bad: 1

## Improvements
- Check related tests before finalising the review

## Notes
- 2026-09-07 missed a dependency in an Angular service (user flagged)
```

Tags on memory lines (`git`, `build`, `arch`, `db`, `pref`, `decision`, `gotcha`) cost
nothing now and let a skill later say `memory-tags: [git]` in its frontmatter so the
hook injects only matching lines. Not needed until memory files get long.

## Token budget per session

| Injected | When | Cap |
|---|---|---|
| `knowledge/alfred-core.md` | first Alfred skill of the session | ~500 tokens |
| `memory/global.md` | first Alfred skill | 20 lines, ~300 tokens |
| `.alfred/memory.md` | first Alfred skill | 40 lines, ~600 tokens |
| `feedback/<skill>.md` Improvements | every Alfred skill | 8 lines, ~150 tokens |
| last 2 session summaries | first Alfred skill | ~300 tokens |
| session-start pointer | session open, only if `.alfred/` exists | 1 line |

First skill about 1,800 tokens, later skills about 200. For scale: the `ship-pr` skill
text alone is about 2,500 tokens. Memory costs less than the skill it feeds.

## Keeping it small (who does what)

| Threat | Code (hook) | Rules (AI) |
|---|---|---|
| Memory grows forever | warns when over 40 lines, refuses to inject beyond cap | consolidates lines when warned |
| Duplicate facts | | searches before adding, updates in place |
| Stale facts | every line dated | discounts old lines, asks user when in doubt |
| Session spam | deletes empty session files, keeps newest 30 | writes summary only on real result |
| Wrong project | root detection, refusal list | |
| Secrets in memory | (later) regex scan for token-like strings | forbidden by rules |
| Two sessions writing at once | last write wins, small file, low damage | |

## Multiple projects, monorepos, nesting

- Different folders, different `.alfred/`. Automatic. Nothing to configure.
- Monorepo: one `.alfred/` at the git root by default. Want one per package? Create
  an empty `.alfred/` in that package once. Nearest `.alfred/` wins from then on.
- Not a git repo: `.alfred/` lands in the folder you ran from, unless that folder is
  home, a drive root, or temp.
- Alfred's own repo is a normal workspace too. Its `.alfred/` self-ignores like any other.
