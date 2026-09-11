# Alfred

Shared skills for AI coding tools. One folder of skill files, every tool
reads the same copy. No duplication, nothing to re-teach when you switch
between Claude Code and GitHub Copilot.

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
  knowledge/                 Reserved (empty)
  memory/                    Reserved (empty)
  config/skills-index.json   Generated by build, gitignored
  plugin/                    Generated by sync, gitignored
  logs/                      Generated by sync, gitignored
  .github/plugin/marketplace.json   Copilot local marketplace manifest
  teardown.sh                Undo sync on macOS / Linux
  teardown.ps1               Undo sync on Windows
```

Zero runtime dependencies on purpose.

## Not built yet

`knowledge/`, `memory/` (read-before/write-after across tools),
self-improvement tracking, change history. Deliberately deferred until the
skills sync proved out.

## License

Unlicensed, personal project. No license file yet, add one before treating
this as reusable by anyone else.
