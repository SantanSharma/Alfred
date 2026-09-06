'use strict';

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');
const { buildIndex } = require('./skillsIndex');

// Shape both Claude Code and Copilot read from:
// plugin/.claude-plugin/plugin.json + plugin/skills/<name>/SKILL.md. One build feeds every tool.

function generatePluginJson() {
  const pkg = require(path.join(PATHS.root, 'package.json'));
  const manifest = {
    name: 'alfred',
    displayName: 'Alfred',
    version: pkg.version,
    description: pkg.description,
  };
  const dir = path.join(PATHS.plugin, '.claude-plugin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2));
}

// Rebuilt from scratch every time, so deleted skills disappear from every tool.
function syncSkills(skills) {
  const outRoot = path.join(PATHS.plugin, 'skills');
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  for (const skill of skills) {
    const skillDir = path.join(outRoot, skill.name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(skill.path, path.join(skillDir, 'SKILL.md'));
  }
}

// Throws if any skill is invalid; nothing is written to plugin/ in that case.
function buildPlugin() {
  const skills = buildIndex();
  fs.mkdirSync(PATHS.plugin, { recursive: true });
  generatePluginJson();
  syncSkills(skills);
  return skills.length;
}

module.exports = { buildPlugin };
