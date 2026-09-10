# Alfred workspace memory and capability feedback: analysis and proposal

Written 2026-09-09 against the Alfred repo as it is today (3 commits, skills sync
working, `memory/` and `knowledge/` empty, no hooks). Nothing here is built.

Verified facts this proposal rests on (checked in docs and in local Claude Code and
Copilot transcripts on this machine):

| Fact | Claude Code | Copilot CLI |
|---|---|---|
| Skill invocation is a tool call | tool `Skill`, input `{"skill":"<name>"}` | tool `skill`, args `{"skill":"<name>"}` |
| Hook that fires before a skill runs | `PreToolUse` matcher `Skill`, may return `additionalContext` | `preToolUse` matcher `^skill$`, output limited to allow/deny/modifiedArgs |
| Hook that can inject context around skill start | `PreToolUse` | `postToolUse` (returns `additionalContext`; fires when the `skill` tool returns the skill text, before the model does the work) |
| Session start context | `SessionStart` `additionalContext` | `sessionStart` `additionalContext` |
| Session end | `SessionEnd`, command runs, no model, tight time budget | `sessionEnd`, same |
| Hook input has `cwd` | yes (`cwd`, `session_id`) | yes (`cwd`, `sessionId`) |
| Where hooks can live | `~/.claude/settings.json` (already used by caveman on this machine), or a real plugin install. A junction under `~/.claude/skills/` loads skills only, never hooks. | `plugin/hooks.json` inside the live plugin, `.github/hooks/*.json`, or `~/.copilot/hooks/*.json` |

Consequence: the hook idea is implementable in both tools with one script, and no
skill file needs to change.

---

## 1. Verdict first

Worth building, with two corrections to the idea as stated.

1. It is not a new feature. It is roadmap items 4 (hooks), 1 (memory) and 6 (usage
   stats) built together, with memory scoped to the workspace instead of to
   `Alfred/memory/`. The roadmap's `memory/shared` + `memory/local` split should be
   dropped in favour of this; a workspace folder that is self-ignored is the
   `local` layer, and `shared` is what CLAUDE.md and repo docs already are.
2. Success and failure counts cannot be produced honestly by the model grading
   itself. Usage count is deterministic and reliable. Good/bad ratings must come
   only from explicit user signal. Anything else turns the feedback loop into noise
   that later "improvements" would be built on.

The smallest correct foundation is: one hook script, one contract document, one
folder convention. Everything else (tags, indexing, aggregation, proposals) can be
added without changing that foundation.

---

## 2. What exists today and where the hook plugs in

- Skills are plain `.md` instructions. `alfred sync` copies them to
  `plugin/skills/<name>/SKILL.md` and connects `plugin/` to both tools. Skills have
  no runtime, no access to `paths.js`, no shared preamble. `create-skill` hardcodes
  an absolute path because there is no other way to give a skill machine context.
- There is no per-project config and no hook infrastructure in the repo.
- `~/.claude/settings.json` on this machine already carries command hooks
  (`SessionStart`, `UserPromptSubmit` for caveman). Same mechanism, proven.
- Copilot loads `plugin/` live from the Alfred folder. A generated
  `plugin/hooks.json` is picked up with no reinstall.
- Claude Code tool name for a skill is `Skill`; the skill name arrives without the
  `alfred:` prefix in transcripts on this machine (e.g. `mo-pr-template`), so the
  hook must accept both `alfred:<name>` and `<name>` and check the name against
  `config/skills-index.json` to ignore non-Alfred skills.

Integration point: the moment the model calls the skill tool. That is the only event
common to both tools that (a) identifies the skill, (b) happens before the work,
(c) carries `cwd`, and (d) can inject text into the model. Session start is a
secondary, cheaper point used only for a one-line pointer.

---

## 3. Folder: name, location, layout

Name: `.alfred/` at the workspace root.

Why: dot-prefixed and tool-named like `.git`, `.vscode`, `.idea`. Hidden by
default. Not purpose-named, so later it also holds a project profile
(roadmap 5), a handoff note (roadmap 9), and per-workspace config without a second
folder. Any model that sees `.alfred/` knows whose it is.

```
<workspace-root>/
  .alfred/
    .gitignore        contains a single "*" line. Folder ignores itself.
    README.md         generated once. 12 lines. Tells a human or a stray model what this is.
    memory.md         workspace memory. One fact per line. Hard cap.
    sessions/
      2026-09-09-1430-claude.md
      2026-09-09-1612-copilot.md
    feedback/
      pr-code-review.md
      ship-pr.md
    .state/
      sessions.json   hook bookkeeping only: sessionId -> file, context-injected flags
```

Naming changes from the idea: `GenericMemory/` becomes a single `memory.md`.
One file is one grep for duplicates, one surface to cap, one read to inject. A
folder invites scatter. If it ever needs splitting, the hook can accept
`memory/*.md` later without breaking anything. `Sessions/` and
`CapabilityFeedback/` become `sessions/` and `feedback/`, lowercase, short.

### .gitignore handling

Do not edit the project's `.gitignore`. Write `.alfred/.gitignore` containing `*`.
Git ignores the folder entirely, `git status` stays clean, and Alfred never touches a
tracked file in someone else's repo (team-owned `.gitignore`, protected branches,
monorepo lint rules on that file). Cost: `git clean -fdx` removes it. Acceptable for
operational memory; an export command can come later if that bites.

### Workspace root detection (deterministic, in the hook)

Input: hook `cwd`.

1. Walk up from `cwd`. First directory containing `.alfred/` wins. This makes
   nesting opt-in: a sub-project in a monorepo gets its own memory only if
   someone creates `.alfred/` there.
2. Otherwise the first directory containing `.git` (directory or file, so
   worktrees count). Monorepo default is one memory at the repo root.
3. Otherwise `cwd` itself.
4. Refuse silently (no folder created, hook exits 0 with no output) when the
   result is the user home directory, a drive root, the OS temp directory, or
   when `ALFRED_MEMORY=off` is set in the environment.

### When memory is created and when it is not

Created only on the first Alfred skill invocation in a workspace. Never at
session start, never for plain chat, never when the skill is not an Alfred skill,
never in the refused locations above. A session that used no Alfred skill leaves
nothing behind.

---

## 4. Hook design

One zero-dependency Node script, `Alfred/hooks/alfred-hook.js`, with three
actions. It reads the hook JSON from stdin, detects which tool sent it by field
names (`tool_name` vs `toolName`), and prints the tool's expected JSON shape.

| Action | Claude Code event | Copilot event | Does |
|---|---|---|---|
| `session-start` | `SessionStart` (startup, resume, compact) | `sessionStart` | If `.alfred/` exists: inject one line, e.g. `Alfred workspace memory at .alfred/ (23 facts, last session 2026-09-08 "ship-pr for export CSV"). Alfred skills load it on use.` If it does not exist: no output. Creates nothing. |
| `skill-start` | `PreToolUse` matcher `Skill` | `postToolUse` matcher `^skill$` | Skill name from input, strip `alfred:`, ignore if not in `skills-index.json` or skill has `memory: false`. Ensure `.alfred/` layout. Bump `uses` and `last` in `feedback/<skill>.md`. Create or reuse the session file, append skill name to its `skills:` line. Inject context (see budget). |
| `session-end` | `SessionEnd` | `sessionEnd` | Delete the session file if it has only the header and no summary. Prune `sessions/` to the newest 30. Clear the session's `.state` entry. No model, no output. |

Not used in the MVP: `Stop` / `agentStop` (fires every turn, would either nag or
cost a model call each turn), `UserPromptSubmit` (would add context to every
prompt, exactly the token waste to avoid).

### What `skill-start` injects (token budget)

First Alfred skill in a session (once):

| Piece | Source | Cap |
|---|---|---|
| Memory contract | `Alfred/knowledge/workspace-memory.md` | ~40 lines, ~500 tokens |
| Workspace memory | `.alfred/memory.md` | 40 lines, ~600 tokens |
| This skill's feedback | `## Improvements` section of `feedback/<skill>.md` only | 8 bullets, ~150 tokens |
| Recent sessions | newest 2 files, heading + `## Summary` lines | ~300 tokens |

Total under 1.6k tokens. A single skill file like `ship-pr` is already ~2.5k, so
the overhead is smaller than the skill it wraps.

Later Alfred skills in the same session: only that skill's `## Improvements`
section plus one line: `Memory contract already loaded this session; .alfred/
unchanged since` or `memory.md changed, re-read it`. Under 200 tokens.
Bookkeeping for "already injected" lives in `.alfred/.state/sessions.json`.

Copilot detail: `postToolUse` is the injection point because `preToolUse` cannot
add context there. Counting and folder creation can still happen in `preToolUse`
if wanted, but doing everything in `postToolUse` keeps one action, and the model
has not started working yet at that moment.

### Wiring, per tool

Claude Code: `alfred sync` merges three hook entries into
`~/.claude/settings.json`, each tagged with a recognisable command string
(`node "<Alfred>/hooks/alfred-hook.js" <action>`), so a re-run finds and
updates them instead of duplicating, and `teardown.ps1` removes them by the same
tag. This is the caveman pattern already on the machine. The alternative, turning
the Claude route into a real plugin install via a local marketplace so
`plugin/hooks/hooks.json` serves both tools, is cleaner but changes the proven
skills route. Do it later once the hook is stable, not in the MVP.

Copilot: `pluginBuild.js` also writes `plugin/hooks.json` with `powershell` and
`bash` command variants pointing at the same script. Live plugin, nothing else to
do. Verification item: confirm plugin hooks run in the VS Code Copilot runtime
(1.0.81) and not only in the CLI. If they do not, the CLI still works and VS Code
gets the folder convention without automatic injection until VS Code updates.

### Deterministic versus model-driven

| Deterministic (hook script) | Model-driven (contract text) |
|---|---|
| Root detection, refusal rules | What is worth writing to `memory.md` |
| Folder creation, self-ignore, README | Session summary content |
| `uses` and `last` counters | Whether a user remark is a rating or an improvement note |
| Session file allocation and `skills:` line | Merging a new fact into an existing line instead of appending |
| Context assembly, caps, once-per-session logic | Deciding a fact belongs in CLAUDE.md or team docs instead of here |
| Pruning sessions, deleting empty ones | |
| Warning when `memory.md` exceeds cap | Consolidating `memory.md` when warned |

Rule of thumb: anything about where, how many, and how much is code. Anything about
meaning is the model, bounded by the contract.

---

## 5. The contract: `Alfred/knowledge/workspace-memory.md`

This text is the actual "fundamental capability". Skills never repeat it; the hook
injects it once per session. Draft, about 35 lines:

```
# Alfred workspace memory (contract)

You are running an Alfred skill inside a workspace that has Alfred memory at
<root>/.alfred/. Same layout in every workspace. Ignored by git.

Files
- memory.md          facts about this workspace that stay true across sessions and skills
- sessions/<file>.md this session's note (path given below). Older ones are history.
- feedback/<skill>.md how this skill has performed here. Counters are maintained for you.

Read
- Everything relevant is already in this message. Do not open other files in .alfred/
  unless the task needs older session history.

Write to memory.md only when a fact is
- true beyond this session, and
- likely to change how an Alfred skill acts here later, and
- not already derivable from the repo, CLAUDE.md, or repo docs (if it belongs there, say so instead).
One line per fact: "- [tag] YYYY-MM-DD fact". Tags: git, build, arch, db, pref, decision, gotcha.
Before adding, search memory.md for the same topic and update that line instead.
Never store secrets, credentials, personal data, conversation transcripts, or code blocks.
Cap: 40 lines. If the hook says the cap is exceeded, consolidate before adding.

Session note (sessions/<file>.md)
- When the skill's work concludes with a real result, append at most 6 lines under "## Summary":
  what was done, decisions, one-line gotchas, what is still open.
- Skip it if nothing was produced or the user only asked a question.

Feedback (feedback/<skill>.md)
- Record a rating only when the user clearly signals one ("that was wrong", "good, exactly this").
  Increment rated_good or rated_bad and add one bullet under "## Notes" with the date.
- Add to "## Improvements" only when the user asks for a behaviour change or the same
  problem appears twice. Merge with existing bullets. Cap 8 bullets per section.
- Never edit the uses/last counters.

Store less, but store what matters. Every line here costs tokens in every future session.
```

---

## 6. File formats

`memory.md`

```
# Workspace memory
- [git] 2026-09-07 PRs target develop, not main
- [pref] 2026-09-05 branch prefix ss_ (also saved by ship-pr)
- [db] 2026-09-08 DB team wants snake_case column names
- [gotcha] 2026-09-08 pull_request_template.md differs between V2Web and MO_Database, always read the file
```

`sessions/2026-09-09-1430-claude.md`

```
# 2026-09-09 14:30 claude
skills: pr-code-review, ship-pr

## Summary
- Reviewed PR #412 (export CSV). Two blocking findings, both fixed in-session.
- Shipped as ss_fix_export_nulls, PR #415.
- Open: CSV date format not confirmed with product.
```

`feedback/pr-code-review.md`

```
# pr-code-review
uses: 14
last: 2026-09-09
rated_good: 3
rated_bad: 1

## Improvements
- Check related tests before finalising the review
- Follow the service dependency chain into Angular consumers

## Notes
- 2026-09-07 missed a dependency in an Angular service (user flagged)
- 2026-09-09 good: caught the null handling in the export mapper
```

Counter lines are `key: value` so the hook can bump them with a regex and the
model never has to touch them. Section caps are enforced by instruction; the
hook warns when a section exceeds its cap so the model merges.

---

## 7. Critical evaluation

### What it solves

- Cross-tool amnesia. Claude learns a convention on Monday, Copilot repeats the
  mistake on Tuesday. Workspace-local files read by both tools fix this. This is
  the reason Alfred exists per the original idea spec.
- Skill files stop carrying machine or project state (`create-skill` hardcodes a
  path; `ship-pr` invents `~/.claude/ship-pr/*.txt`). Both can move to
  `.alfred/memory.md` or a future `.alfred/config.json`.
- One hook instead of N skills each inventing memory handling. New skills get
  memory for free and cannot do it differently.
- Usage counts give a real signal for pruning dead skills (roadmap 6) with no extra
  work.

### Where it is weaker than it sounds

- Three memory systems exist already: Claude Code's own per-project auto-memory
  (`~/.claude/projects/<slug>/memory/`, in use on this machine), CLAUDE.md, and
  Copilot's `.github/copilot-instructions.md`. Alfred memory must stay narrow:
  facts Alfred skills need, plus cross-tool handoff. The contract says so
  explicitly. Without that line it becomes a fourth place to look.
- Model-graded success rates are not evidence. Restricting ratings to explicit user
  signal keeps the numbers honest but also small. Expect usage counts and
  `## Notes` bullets to be the useful part for a long time.
- Session notes are the biggest bloat risk. Mitigations: written only on a real
  result, 6-line cap, empty files deleted at session end, newest 30 kept.
- Stale facts. A fact dated 2026-03 about a branch name may be wrong by 2026-09.
  Dates on every line let the model discount old facts; a later `alfred memory
  review` can list lines older than N months for a human decision.
- Concurrency. Two sessions in the same workspace both append to `memory.md`.
  Last write wins. The file is small and append-heavy, so damage is one lost line
  at worst. Not worth locking in the MVP.
- Privacy. Memory is per checkout, so per user on a shared machine, and never
  committed. The remaining risk is a model writing a secret into `memory.md`.
  The contract forbids it; a regex scan for token-like strings in the hook is a
  cheap later addition.
- Temp and scratch directories. Covered by the refusal list, but a skill run from
  a random clone under `Downloads/` will still create `.alfred/` there. Harmless
  and self-ignored; accept it.
- Copilot in VS Code may not run plugin hooks on its bundled runtime. Verify
  before promising the VS Code path.
- Hook latency. One Node process start per skill invocation, roughly 100 to 200 ms
  on this machine. Fine. `SessionEnd` has a short budget, so that action must do
  file operations only.

### Where this would be over-engineering

- Any indexing, embeddings, or search layer. At 40 lines of memory and 2 recent
  sessions, whole-file injection is cheaper than retrieval machinery.
- A database, a dashboard, a scoring formula. The roadmap's "keep out" list already
  says no; the feedback file is a text file a human reads in ten seconds.
- Auto-applying improvements to skills. Roadmap 11 stays last and stays gated.
  `feedback/` is the evidence pile that a future `alfred review` reads; it is not
  an actuator.
- Per-skill memory folders. The per-skill unit is the feedback file. Skills that
  need durable settings write tagged lines to `memory.md`.

---

## 8. Improvements folded into the proposal

- Self-ignoring folder instead of editing the project's `.gitignore`.
- Nearest `.alfred/` wins, so monorepo sub-projects can opt in without a
  config system.
- Tagged, dated, one-line facts in `memory.md`. Tags make future filtering
  (skill frontmatter `memory-tags: [git]`, hook injects matching lines only)
  a five-line change with no format migration.
- Context injected once per session, delta thereafter, tracked in `.state/`.
- Ratings only from explicit user signal. Usage from code.
- Skill opt-out via frontmatter `memory: false` for trivial skills
  (`santan-voice`, `mo-pr-template`) so they cost nothing.
- Sessions self-clean: empty ones deleted, count capped.
- Session file name carries the tool (`-claude`, `-copilot`) so handoff
  direction is visible.

---

## 9. MVP: files to add or change

All inside `Alfred/`. No skill file changes.

| Path | Change | Why here |
|---|---|---|
| `hooks/alfred-hook.js` | new, zero deps, ~200 lines | Hooks belong beside `src/` but are executed by the tools, not by the CLI; separate folder mirrors the roadmap's `hooks/`. |
| `knowledge/workspace-memory.md` | new, the contract | First real occupant of `knowledge/`; it is reference text skills point at, exactly what that folder was reserved for. |
| `src/core/pluginBuild.js` | also write `plugin/hooks.json` for Copilot | Same generated artefact that already reaches Copilot live. |
| `src/integrations/claude.js` | merge and remove the three hook entries in `~/.claude/settings.json`, idempotent, tagged by command string | Same file that already owns the Claude connection. |
| `src/core/skills.js`, `skillsIndex.js` | carry optional `memory: false` frontmatter into the index | Hook reads the index to decide Alfred-or-not and opt-out. |
| `teardown.ps1` | remove the settings.json hook entries | Keeps teardown complete. |
| `README.md`, `Alfred-vault/Alfred-2.0/alfred-reference.md` | document folder, hook, contract | Standing rule: reference updated in the same change. |
| `.gitignore` in Alfred | nothing new; `.alfred/` in the Alfred repo itself is self-ignored like anywhere else | |

Deferred, in order: `alfred memory` (show status for cwd, list stale lines);
tag filtering by skill frontmatter; `alfred feedback` (aggregate `feedback/`
across known workspaces, feeds roadmap 6 and 11); move Claude route to a plugin
marketplace so `plugin/hooks/hooks.json` serves both tools; `.alfred/config.json`
for project profiles (roadmap 5); secret scan in the hook.

### Acceptance checks for the MVP

1. Throwaway git repo, Claude Code: invoke `/alfred:idea-grill`. `.alfred/`
   appears with `.gitignore`, `README.md`, `memory.md`, `sessions/<file>`,
   `feedback/idea-grill.md` showing `uses: 1`. `git status` clean. Contract text
   visible to the model once; second Alfred skill in the same session gets only
   the delta.
2. Same repo, Copilot CLI: `/alfred idea-grill`. `uses: 2`, new session file
   with `-copilot`. Then verify the same in VS Code Copilot Chat and record the
   result.
3. Session with no Alfred skill: nothing created. Session with a skill but no
   result: session file removed at end.
4. `cwd` = home directory or `%TEMP%`: nothing created, hook exits 0.
5. `alfred sync` twice: settings.json has exactly three Alfred hook entries.
   `teardown.ps1`: zero.
