# Alfred: what to build next

Ideas only, nothing here is built. Written 2026-09-07 after checking the repo:
`skills/` works and syncs to Claude Code + Copilot. `memory/` and `knowledge/`
are empty folders. No hooks, no MCP, no per-project config.

The one idea behind everything below: **Alfred is the brain, the AI tool is
just the hands.** Skills, memory, knowledge, and rules live in Alfred once,
and every tool (Claude Code, Copilot, Codex, Cursor, whatever comes next)
reads the same copy. Nothing below breaks that.

---

## 1. Shared memory (read before, write after)

**What:** a `memory/` folder of plain `.md` notes. Every tool reads it when a
session starts and appends to it when the session ends.

**How you use it:** nothing manual. `alfred sync` wires it in. You work
normally. At the end the tool writes 3 to 5 lines: what was done, what was
decided, what is still open.

**Real problem:** you explain "V2Web uses feature flags in `FeatureService`,
never hardcode" to Claude on Monday, then to Copilot on Tuesday, then to
Claude again on Wednesday in a new session. 30 to 60 minutes a week lost.

**Example:** Claude Code learns the DB team wants `snake_case` column names
and writes it to `memory/MO_Database.md`. Next morning Copilot reads that file
first and never proposes `camelCase`.

Two layers: `memory/shared/` (goes in git, team sees it) and `memory/local/`
(gitignored, only you). This is the original reason Alfred exists.

---

## 2. Knowledge packs

**What:** a `knowledge/` folder of reference documents that skills can point
at instead of copying text into themselves. PR template, architecture
notes, API conventions, onboarding docs.

**How you use it:** drop a `.md` (or `.json`, `.yaml`) in `knowledge/`. In a
skill write `See knowledge/pr-template.md`. `alfred sync` ships the file next
to the skills so the tool can open it.

**Real problem:** `mo-pr-template` and `ship-pr` both contain the PR template.
Update one, forget the other, PRs go out with the old format.

**Example:** the company changes the PR template. Edit
`knowledge/pr-template.md` once, run `alfred sync`, every skill in every tool
uses the new one.

---

## 3. Alfred MCP server (the universal plug)

**What:** `alfred mcp` starts a small local MCP server that exposes skills,
memory, and knowledge as tools and resources. Any MCP-capable app connects
to it: Codex CLI, Cursor, Windsurf, Claude Desktop, VS Code agents.

**How you use it:** run `alfred mcp` once (or let `alfred sync` register it).
Point the new tool's MCP config at it. Done, that tool now sees every Alfred
skill and memory note.

**Real problem:** today every new AI tool needs its own adapter code
(`claude.js`, `copilot.js`, `codex.js`). Tools launch every few months.
Writing an adapter per tool does not scale.

**Update (2026-09-11):** Codex turned out not to need this. It reads
`~/.agents/skills` (a tool-neutral root) and falls back to Claude's
`.claude-plugin/plugin.json`, so `codex.js` is ~30 lines of symlinks and
skills work today. Two lessons: the ecosystem is converging on shared
paths and on Claude's manifest format, so check for those before assuming
an adapter is needed; and MCP is no longer the unlock for *skills*.

What MCP is still the unlock for: **memory and knowledge** (features 1 and
2). There is no shared-path convention for those, and a tool that reads a
`SKILL.md` folder still has no way to read `memory/` or append to it. Build
this after 1 and 2 exist, and scope it to them.

---

## 4. Hooks (rules the tool cannot forget)

**What:** a `hooks/` folder with small rules that `alfred sync` installs into
each tool's hook system (Claude Code `settings.json` hooks, Copilot
equivalent where supported).

**How you use it:** one file per rule, plain text or a tiny script. Sync
installs them. They run automatically, before or after the tool acts.

**Real problem:** a skill can *ask* the model to never force-push. A hook
*stops* it. Instructions get skipped when context is long; hooks do not.

**Examples:**
- Before any `git push --force`: block, ask you to confirm.
- Before committing: refuse if a `.env` or `appsettings.*.json` with secrets is staged.
- At session start: load `memory/` (this is how feature 1 actually runs).
- At session end: write the memory summary.
- After a PR is opened: log which skills were used (feeds feature 6).

---

## 5. Project profiles

**What:** an `.alfred.json` (or a block in `CLAUDE.md`) inside any repo that
says which skills, memory files, and knowledge packs apply *there*.

**How you use it:** `alfred init` in a repo. Pick categories (`git`,
`planning`, `dotnet`). From then on tools in that repo see only those.

**Real problem:** you will end up with 40 skills. In `MO_Database` only 6
matter. The rest are noise in the `/` picker and waste model context.

**Example:** in `V2Web` you type `/alfred:` and see web and git skills. In
`MO_Database` you see SQL and migration skills. Same Alfred, filtered view.

---

## 6. Skill usage stats (local only)

**What:** `alfred stats` shows which skills were used, how often, and when
last. Written by a hook, stored locally, never sent anywhere.

**How you use it:** run `alfred stats` once a month.

**Real problem:** dead skills pile up. Nobody remembers if `task-estimation`
was used in the last quarter.

**Example:** stats show `learn-by-building` used 0 times in 90 days. Archive
it. `ship-pr` used 60 times: worth polishing.

---

## 7. Skill doctor

**What:** `alfred doctor` lints every skill. Weak or missing description,
two skills with overlapping triggers, hardcoded paths that no longer exist,
references to knowledge files that were deleted.

**How you use it:** run it before `alfred sync`, or let sync run it and
warn.

**Real problem:** skills rot silently. `create-skill` hardcodes
`E:\code_with_santan\Alfred-2.0\Alfred`. Move the folder and the skill breaks
with no warning until a model trips over it.

**Example:** doctor prints
`create-skill: path E:\...\Alfred not found on this machine`
before you waste a session finding out the hard way.

---

## 8. Team mode (share skills, keep memory private)

**What:** the Alfred repo itself is the distribution channel. `alfred sync
--pull` does `git pull` first, then syncs. Shared skills and knowledge come
down; `memory/local/` stays on your machine.

**How you use it:** teammate clones the repo, runs `npm install -g . ;
alfred sync`. Has every team skill in every tool immediately.

**Real problem:** onboarding a new dev to conventions takes weeks of "we
don't do it that way here" in code review.

**Example:** new hire's Copilot already knows the PR template, branch naming,
and review checklist on day one. Zero training.

---

## 9. Cross-tool handoff

**What:** `alfred handoff` writes a short "where I am" note: branch, task,
what is done, what is open, what to avoid. The next tool reads it at start.

**How you use it:** type `alfred handoff` (or `/alfred:handoff`) before you
switch tools. Nothing else.

**Real problem:** you hit Claude usage limits mid-task and switch to Copilot.
Copilot starts blind. You retype the whole situation.

**Example:** handoff note says "on branch `feat/export-csv`, service done,
controller pending, don't touch `LegacyExport.cs`". Copilot picks up exactly
there.

---

## 10. Skill composition

**What:** a skill can declare `requires: [git-conventions, mo-pr-template]`
in its frontmatter. Build checks the chain exists.

**How you use it:** add the `requires` line. `alfred build` fails if a
required skill is missing or renamed.

**Real problem:** `ship-pr` repeats instructions from `git-conventions`. They
drift apart.

**Example:** rename `mo-pr-template` to `pr-template`. Build fails with
`ship-pr requires mo-pr-template: not found`. You fix it before any tool
sees a broken skill.

---

## 11. Self-improving skills (with a human gate)

**What:** after a skill runs, the tool may write a *proposed* edit to the
skill into `memory/proposals/`. Nothing changes on its own. `alfred review`
shows proposals as diffs, you accept or reject.

**How you use it:** run `alfred review` weekly. Press y or n per proposal.

**Real problem:** you notice mid-session "the skill should also check X",
fix it in your head, never update the file.

**Example:** `pr-code-review` missed a null check pattern three times. It
proposes adding "check nullable reference types in DTOs" to its own
checklist. You accept. Every tool improves at once.

Note: this was deliberately deferred during the original idea-grill. Listed
here because it is the natural end of features 1, 4, and 6. Build it last,
and only with the human gate.

---

## Suggested order

1. **Hooks** (4). Small, and features 1, 6, 9 all need them.
2. **Memory** (1). The reason the project exists.
3. **Knowledge** (2). Cheap once 1 is done, same mechanics.
4. **MCP server** (3). Unlocks every other tool without adapters.
5. **Project profiles** (5) and **doctor** (7). Quality of life as the skill count grows.
6. **Handoff** (9), **stats** (6), **composition** (10), **team mode** (8).
7. **Self-improving** (11). Last, gated.

## Keep out (on purpose)

- Cloud sync or accounts. Git is the sync.
- A web UI or dashboard. `alfred stats` in the terminal is enough.
- Storing memory as a database. Plain `.md` files stay readable, diffable, and editable by hand.
- Auto-applying anything the model writes. Human gate always.
