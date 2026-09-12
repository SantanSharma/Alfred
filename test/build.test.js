'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { registrations } = require('../src/integrations/memoryHooks');

test('build preserves source skills and opt-outs; generated startup works through the real CLI from another cwd', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-build- space '));
  t.after(() => {
    assert.equal(path.dirname(dir), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('alfred-build-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const repo = path.resolve(__dirname, '..');
  for (const name of ['src', 'bin', 'hooks', 'knowledge', 'package.json']) fs.cpSync(path.join(repo, name), path.join(dir, name), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills'));
  const source = '---\nname: sample\ndescription: Test skill\n---\n# Original instructions\n';
  const disabled = source.replace('name: sample', 'name: disabled\nmemory: false');
  fs.writeFileSync(path.join(dir, 'skills', 'sample.md'), source);
  fs.writeFileSync(path.join(dir, 'skills', 'disabled.md'), disabled);
  function build() {
    const result = spawnSync(process.execPath, ['-e', "require('./src/core/pluginBuild').buildPlugin()"], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  build();
  const built = fs.readFileSync(path.join(dir, 'plugin', 'skills', 'sample', 'SKILL.md'), 'utf8');
  assert.match(built, /## Alfred memory startup/);
  assert.ok(built.endsWith('# Original instructions\n'));
  assert.equal(fs.readFileSync(path.join(dir, 'skills', 'sample.md'), 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(dir, 'plugin', 'skills', 'disabled', 'SKILL.md'), 'utf8'), disabled);
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'config', 'skills-index.json')));
  assert.equal(index.skills.find(skill => skill.name === 'disabled').memory, false);
  const workspace = path.join(dir, 'workspace'); fs.mkdirSync(workspace);
  for (const tool of ['claude', 'copilot', 'codex']) {
    const result = spawnSync(process.execPath, [path.join(dir, 'bin', 'alfred.js'), 'memory', 'start', '--skill', 'sample', '--tool', tool, '--session', `smoke-${tool}`], { cwd: workspace, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Alfred memory ready: sample/);
    assert.ok(result.stdout.includes(path.join(workspace, '.alfred')));
  }
  assert.match(fs.readFileSync(path.join(workspace, '.alfred', 'feedback', 'sample.md'), 'utf8'), /uses: 3/);
  if (process.platform === 'win32') {
    const input = JSON.stringify({ cwd: workspace, sessionId: 'native-copilot', toolName: 'skill', toolArgs: { skill: 'sample' } });
    const hook = registrations('copilot', dir).postToolUse[0];
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', hook.powershell], { cwd: workspace, input, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).additionalContext, /Alfred memory ready: sample/);
    const codexHook = registrations('codex', dir).SessionStart[0].hooks[0];
    const codex = spawnSync('powershell.exe', ['-NoProfile', '-Command', codexHook.command_windows], { cwd: workspace,
      input: JSON.stringify({ cwd: workspace, session_id: 'native-codex', hook_event_name: 'SessionStart' }), encoding: 'utf8' });
    assert.equal(codex.status, 0, codex.stderr);
    assert.equal(JSON.parse(codex.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
    const gitBash = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'bin', 'bash.exe');
    if (fs.existsSync(gitBash)) {
      const claudeHook = registrations('claude', dir).PreToolUse[0].hooks[0];
      const claude = spawnSync(gitBash, ['-c', claudeHook.command], { cwd: workspace,
        input: JSON.stringify({ cwd: workspace, session_id: 'native-claude', hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'sample' } }), encoding: 'utf8' });
      assert.equal(claude.status, 0, claude.stderr);
      assert.equal(JSON.parse(claude.stdout).hookSpecificOutput.hookEventName, 'PreToolUse');
    }
  }
  fs.writeFileSync(path.join(dir, 'memory', 'global.md'), 'personal fact');
  build();
  assert.equal(fs.readFileSync(path.join(dir, 'memory', 'global.md'), 'utf8'), 'personal fact');
  assert.equal(fs.readFileSync(path.join(dir, 'plugin', 'skills', 'sample', 'SKILL.md'), 'utf8'), built);
  fs.writeFileSync(path.join(dir, 'skills', 'bad.md'), '---\nname: ../escape\ndescription: Invalid\n---\n');
  const invalid = spawnSync(process.execPath, [path.join(dir, 'bin', 'alfred.js'), 'build'], { cwd: workspace, encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(fs.existsSync(path.join(dir, 'escape')), false);
});
