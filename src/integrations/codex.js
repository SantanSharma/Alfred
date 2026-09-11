'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const PATHS = require('../core/paths');
const { ensureJunction } = require('../core/junction');

// Codex finds skills by scanning root folders for <skill>/SKILL.md. `~/.agents/skills` is its
// tool-neutral root: it is read from the real home even when CODEX_HOME points elsewhere, and
// the loader follows symlinks. So one link per skill keeps plugin/ live the way Copilot's is --
// edit a skill, run alfred sync, Codex sees it on the next turn. No reinstall, no cache to bust,
// and no `codex` binary needed (on macOS it ships inside the VS Code extension, not on PATH).
//
// Codex also reads `.claude-plugin/plugin.json` as a fallback manifest, so the plugin/ tree the
// Claude and Copilot routes already consume needs no changes: Codex resolves each link back to
// plugin/ and namespaces the skill from that manifest, giving the same `alfred:<skill>` name
// Claude Code uses.
const SKILLS_ROOT = path.join(os.homedir(), '.agents', 'skills');

// Unlike ~/.claude/skills/, this root holds skill folders directly rather than plugin folders
// containing a skills/ subfolder, so each skill is linked individually instead of linking
// plugin/ once. The prefix keeps Alfred's entries from colliding with skills other tools
// install into the same shared root.
const PREFIX = 'alfred-';

const BUILT_SKILLS = path.join(PATHS.plugin, 'skills');

// Reads the built output rather than skills/ so this mirrors exactly what the build produced.
function builtSkills() {
  if (!fs.existsSync(BUILT_SKILLS)) return [];
  return fs
    .readdirSync(BUILT_SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function linkTarget(link) {
  try {
    return path.resolve(path.dirname(link), fs.readlinkSync(link));
  } catch {
    return null;
  }
}

// An entry counts as Alfred's only if it is a symlink resolving inside our own plugin/skills/.
// Everything else in this shared root belongs to another tool and is never touched.
function ownedLinks() {
  if (!fs.existsSync(SKILLS_ROOT)) return [];
  const base = BUILT_SKILLS + path.sep;
  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => path.join(SKILLS_ROOT, entry.name))
    .filter((link) => {
      const target = linkTarget(link);
      return target !== null && (target + path.sep).startsWith(base);
    });
}

function linkSkill(name) {
  const link = path.join(SKILLS_ROOT, PREFIX + name);

  // ensureJunction treats a real directory at the link path as a stale copied snapshot and
  // deletes it. That is right under ~/.claude/skills/, which Alfred owns outright, but wrong
  // here: a real folder in this shared root is another tool's skill. Refuse instead.
  let stat = null;
  try {
    stat = fs.lstatSync(link);
  } catch {
    stat = null;
  }
  if (stat && !stat.isSymbolicLink()) {
    throw new Error(
      `${link} already exists and is not a symlink. Another tool may own it; move or remove it by hand, then re-run alfred sync`
    );
  }

  return ensureJunction(link, path.join(BUILT_SKILLS, name));
}

// Deleted skills have to disappear from Codex too, and plugin/skills/ is rebuilt from scratch
// every sync, so any owned link with no matching built skill is stale.
function pruneStale(keep) {
  const removed = [];
  for (const link of ownedLinks()) {
    if (keep.has(path.basename(linkTarget(link)))) continue;
    fs.unlinkSync(link);
    removed.push(path.basename(link));
  }
  return removed;
}

function sync(log) {
  const skills = builtSkills();

  log.step('codex: link each skill into ~/.agents/skills/alfred-<name>', () => {
    if (skills.length === 0) return 'no skills built, nothing to link';
    fs.mkdirSync(SKILLS_ROOT, { recursive: true });
    const fresh = skills.map(linkSkill).filter((state) => state !== 'ok').length;
    return `${skills.length} skill(s)${fresh ? `, ${fresh} created or replaced` : ''}`;
  });

  log.step('codex: drop links for deleted skills', () => {
    const removed = pruneStale(new Set(skills));
    return removed.length ? `removed ${removed.join(', ')}` : 'none stale';
  });
}

module.exports = { sync, SKILLS_ROOT, PREFIX };
