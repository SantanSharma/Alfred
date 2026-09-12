# Alfred

Shared skills and local memory for Claude Code, GitHub Copilot and Codex.
One source of skill instructions, one notebook per project, across CLI and VS Code.

## Setup (any machine)

Prereqs: Node 18+, Claude Code, GitHub Copilot CLI (`copilot` on PATH;
optional, the Copilot steps are skipped if it's missing). Codex needs
nothing installed for the sync itself; the links are just there when
Codex looks.

```
git clone git@github.com:SantanSharma/Alfred.git
cd Alfred
npm install -g .
alfred sync
```

First time only: fully quit and reopen VS Code so its bundled Copilot
runtime picks up the plugin. In Claude Code run `/reload-plugins`.

Use the skills:

- Claude Code (terminal or VS Code): `/alfred:idea-grill`
- Copilot (terminal or VS Code chat): `/alfred idea-grill`
- Codex (CLI, VS Code, or the desktop app): type `/` and pick
  `alfred:idea-grill` under the **Skills** group, or type
  `$alfred:idea-grill` directly. Either inserts a skill mention chip, so
  the skill is pinned before you send. Codex also announces the first
  skill it applies in a turn, so you see which one ran.

## Daily use

Add, edit, or delete a `.md` file in `skills/`, then:

```
alfred sync
```

That's the whole workflow. `plugin/skills/` is rebuilt from scratch, so
deleted skills disappear from every tool. To pick up changes in a running
session: Claude Code `/reload-plugins`; Copilot terminal is immediate; VS
Code Copilot Chat, start a new chat (restart VS Code if it still doesn't
show); Codex, run **Force reload skills** from its command menu, or
restart VS Code. Codex caches the skill catalog per app-server process,
and the VS Code extension's server lives as long as the window, so a new
chat alone does not rescan.

## Commands

```
alfred skills                             List all skills.
alfred build                              Validate skills, rebuild config/skills-index.json.
alfred sync [--claude|--copilot|--codex]  Build plugin/ and connect it to every tool. Idempotent.
./teardown.sh                             Undo everything sync did, back to a fresh clone (macOS/Linux). Reversible.
.\teardown.ps1                            Same, on Windows.
```

`alfred sync` prints one `OK` / `SKIP` / `FAIL` line per step and writes
the full run, including captured `copilot` output, to `logs/last-sync.log`.
On failure it prints the failing step, the tool's stderr, the log path, and
exits 1. A skill with missing `description` or a duplicate `name` fails the
build step and nothing is synced out.

## Teardown (back to "new user" state)

From the project folder:

```
./teardown.sh        macOS / Linux
.\teardown.ps1      Windows
```

Removes both junctions, every `~/.agents/skills/alfred-*` link, the Copilot
marketplace registration, the global `alfred` command, and the generated
`plugin/`, `logs/`, `config/skills-index.json`. Junctions first, so nothing
can recurse into the real `plugin/` folder. Bring it back:
`npm install -g . ; alfred sync`.

Both scripts only remove symlinks they can prove are links (and for Codex,
only links that resolve back into this repo), so a real folder at any of
those paths is left alone and reported.

## Skill file format

One `.md` per skill in `skills/` (subfolders allowed):

```
---
name: idea-grill
description: One line, specific enough that `alfred skills` is useful on its own.
---
Instructions the AI tool follows when the skill is invoked.
```

## How it connects (one folder, four routes)

`alfred sync` generates `plugin/` (`.claude-plugin/plugin.json` plus one
`skills/<name>/SKILL.md` per skill). Everything else is a pointer to that
folder:

- **Claude Code**: junction `~/.claude/skills/alfred` -> `plugin/`. Claude
  Code auto-loads every folder under `~/.claude/skills/`, in the terminal
  and the VS Code extension (same program, same config).
- **Copilot CLI, terminal (>= 1.0.84)**: this repo (`Alfred/`) is registered
  as a local plugin marketplace via `.github/plugin/marketplace.json`; the
  CLI reads `plugin/` live, never copies it.
- **Copilot in VS Code**: VS Code bundles an older Copilot runtime (1.0.81)
  with no live-plugin support. It looks in
  `~/.copilot/installed-plugins/alfred/alfred`, so that path is a junction
  -> `plugin/`. Becomes redundant once VS Code ships >= 1.0.84.
- **Codex** (CLI, VS Code extension, desktop app): one link per skill,
  `~/.agents/skills/alfred-<name>` -> `plugin/skills/<name>`.
  `~/.agents/skills` is Codex's tool-neutral skill root, read from the real
  home even when `CODEX_HOME` points elsewhere. Codex follows the link,
  finds `plugin/.claude-plugin/plugin.json` (it reads Claude's manifest as a
  fallback), and names the skill `alfred:<name>` — same name Claude uses.
  That name is what the `/` picker's Skills group and `$` mentions match
  on, so `/alf` or `$alf` finds every Alfred skill.

Why Codex gets links per skill instead of one link to `plugin/`: Claude
Code treats each folder under `~/.claude/skills/` as a plugin, so one link
covers everything. Codex scans its roots for `<skill>/SKILL.md` directly,
so each skill needs its own entry.

Codex also has a plugin/marketplace route, deliberately not used: installing
copies `plugin/` into `~/.codex/plugins/cache/`, so every skill edit needs a
version bump and a reinstall. Links stay live, and they need no `codex`
binary — on macOS it ships inside the VS Code extension, not on PATH.

Rules that follow from this:

- Never run `copilot plugin uninstall alfred`. Its plugin dir is a junction
  into your real `plugin/` folder.
- Don't hand-edit `~/.copilot/config.json`. Copilot regenerates it on every
  run.
- `~/.agents/skills` is shared with other tools. Sync only ever creates,
  replaces, or removes links that resolve back into `plugin/skills/`;
  anything else there is left alone. If a real folder ever occupies an
  `alfred-<name>` path, sync fails loudly rather than deleting it.

## Folder structure

```
Alfred/                      Project directory and git repo root
  bin/alfred.js              CLI entry point
  src/
    cli.js                   Command dispatcher
    commands/
      skills.js              alfred skills
      build.js               alfred build
      sync.js                alfred sync
    core/
      paths.js               Resolves the install root from __dirname, not cwd
      skills.js              Loads skills/**/*.md + frontmatter
      skillsIndex.js         Validates skills, writes the index, throws on errors
      pluginBuild.js         Generates plugin/
      frontmatter.js         Minimal zero-dep frontmatter parser
      junction.js            Idempotent directory-link creation
      log.js                 Per-step OK/SKIP/FAIL logging to logs/
    integrations/
      claude.js              Claude Code connection
      copilot.js             Copilot CLI + VS Code connection
      codex.js               Codex connection via ~/.agents/skills
  skills/                    Source of truth, one .md per skill
  knowledge/                 Shared core rules, committed
  memory/                    Private cross-project facts, gitignored
  hooks/alfred-hook.js        Native hook entry point
  src/memory/                Shared storage engine and hook protocols
  test/                      Node tests for memory and integration generation
  config/skills-index.json   Generated by build, gitignored
  plugin/                    Generated by sync, gitignored
  logs/                      Generated by sync, gitignored
  .github/plugin/marketplace.json   Copilot local marketplace manifest
  teardown.sh                Undo sync on macOS / Linux
  teardown.ps1               Undo sync on Windows
```

Zero runtime dependencies on purpose.

## Shared memory

Run `alfred sync` as usual. Generated skill copies gain a memory startup step;
source files in `skills/` are unchanged. Claude and Copilot also get native skill
hooks. Codex gets lifecycle hooks and uses the generated startup step for skill
memory, because it has no documented dedicated skill-load event.

The first Alfred skill in a workspace creates `.alfred/` automatically:

```
.alfred/
  .gitignore       Self-ignores the entire notebook
  README.md        Explains the files
  memory.md        Dated project facts
  sessions/        Short results and open work, shared across tools
  feedback/        Per-skill usage and explicit user feedback
  .state/          Session bookkeeping (not model context)
```

The startup context reads `knowledge/alfred-core.md`, `memory/global.md`, project
facts, the current skill's improvements, and two recent summaries. Later skills in
the same conversation receive only a reminder, paths and skill improvements.
Feedback `uses` and `last` are updated by code. The agent writes summaries and facts
and records ratings only when you explicitly approve or reject a result. Source
skills are never changed automatically. Review the feedback files every few weeks.

Memory instructions prefer Alfred facts during Alfred skills and flag conflicts.
Current user instructions, host rules and permissions still take precedence.
Native project instruction files are never modified by this feature.

| Host | Native hooks | Portable skill startup |
|---|---|---|
| Claude Code CLI / VS Code | SessionStart, PreToolUse Skill, SessionEnd | Covers direct slash invocation and missing hooks |
| Copilot CLI / VS Code | sessionStart, postToolUse skill, sessionEnd | Covers hosts that skip user hooks or use a different skill-loading tool |
| Codex CLI / VS Code | SessionStart, SessionEnd | Loads context and counts every invocation when the agent follows the startup instruction |

Hooks are merged into `~/.claude/settings.json`, `~/.copilot/hooks/alfred.json`,
and `~/.codex/hooks.json` (`CLAUDE_CONFIG_DIR` / `CODEX_HOME` are honored for hook
locations). Existing unrelated handlers are preserved, including handlers in the
same matcher group. Codex may ask you to review new hooks in `/hooks`; sync does
not change hook trust. The generated startup works independently of hook trust.

Restart/reload the host after sync as described above. In VS Code, disabled hooks,
custom discovery settings and workspace precedence can affect native hooks.
The fallback and all memory writes require the agent's usual shell/filesystem
permissions. A denied or failed memory operation does not block the skill itself.
Remote/WSL hosts need Node and an Alfred installation in that environment.

Root detection chooses the nearest existing `.alfred`, otherwise the nearest
`.git` file/directory, otherwise the working directory. Home, drive/filesystem root,
and the temp directory itself are excluded. Create an empty `.alfred` in a monorepo
package to give that package a separate notebook. Linked notebooks are refused.

Optional controls:

- `ALFRED_MEMORY=off`: disable all memory operations.
- Skill frontmatter `memory: false`: disable memory for that skill, including startup generation.
- `.alfred/config.json`: `{"memory":false}` disables this workspace.
- Caps can be configured as shown below. Reads also have character limits so one
  oversized line cannot flood model context. Facts are capped on injection, never
  silently truncated on disk. Active sessions are retained even above the limit;
  abandoned state expires after seven days. Empty/old sessions are cleaned on a
  later skill start when the host does not emit an end event.

```json
{
  "memory": true,
  "caps": {
    "globalLines": 20,
    "memoryLines": 40,
    "improvementLines": 8,
    "recentSessions": 2,
    "maxSessions": 30
  }
}
```

Troubleshooting or explicit use from a project directory:

```
alfred memory start --skill pr-code-review --tool codex
alfred memory start --skill ship-pr --tool codex --session <returned-session-id>
alfred memory end --tool codex --session <returned-session-id>
```

Generated instructions tell the agent to reuse its conversation's session ID and
skip startup when a native hook already supplied context for that invocation.
`--event <unique-invocation-id>` deduplicates retries; `--refresh` reloads full context
after compaction. Codex can use its `CODEX_THREAD_ID` environment variable. Hosts
without a native session ID receive a new token to reuse within that conversation.

Both teardown scripts remove only this installation's hook handlers, keep unrelated
settings, and preserve global and workspace memory. Notebook files stay on disk;
back them up separately if needed (`git clean -fdx` can remove ignored notebooks).

## Validation and implementation plan

`npm test` runs Node's built-in test runner. Tests exercise real file operations,
all three CLI startup modes, hook envelopes, opt-outs, context caps, session pruning,
concurrent usage, root/link safety, and idempotent hook installation/removal.
These tests do not simulate a successful interactive model response in an editor.

See [the investigation and implementation plan](docs/memory-implementation.md) for
the original requirements, host documentation and design decisions.

## Not built yet

Automatic skill rewriting, a cross-workspace feedback dashboard, and change-history
tracking remain deferred. Feedback collection and shared memory are implemented.

## License

Unlicensed, personal project. No license file yet, add one before treating
this as reusable by anyone else.
