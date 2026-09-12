'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createEngine } = require('../src/memory/engine');
const { resolveRoot } = require('../src/memory/storage');
const { handle } = require('../hooks/alfred-hook');
const { mergeHooks, registrations, install } = require('../src/integrations/memoryHooks');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-test-'));
  t.after(() => {
    assert.equal(path.dirname(dir), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('alfred-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = path.join(dir, 'project');
  const knowledge = path.join(dir, 'knowledge');
  const memory = path.join(dir, 'memory');
  for (const p of [project, knowledge, memory]) fs.mkdirSync(p);
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(path.join(knowledge, 'alfred-core.md'), 'CORE_RULES');
  fs.writeFileSync(path.join(memory, 'global.md'), '- [pref] GLOBAL_FACT');
  const skillsIndex = path.join(dir, 'index.json');
  fs.writeFileSync(skillsIndex, JSON.stringify({ skills: [{ name: 'review', memory: true }, { name: 'ship' }, { name: 'disabled', memory: false }] }));
  const paths = { knowledge, memory, skillsIndex };
  const engine = createEngine(paths);
  const event = { cwd: project, tool: 'claude', skill: 'review', sessionId: 'one' };
  return { dir, project, engine, event, paths };
}
const read = file => fs.readFileSync(file, 'utf8');

test('first use creates self-ignoring layout; later skills use a delta and preserve user feedback', t => {
  const { project, engine, event } = fixture(t);
  assert.equal(engine.lifecycle({ ...event, action: 'session-start' }), null);
  assert.equal(fs.existsSync(path.join(project, '.alfred')), false);
  const first = engine.start(event);
  assert.match(first.context, /CORE_RULES[\s\S]*GLOBAL_FACT/);
  assert.equal(read(path.join(project, '.alfred', '.gitignore')), '*\n');
  assert.match(read(first.feedbackFile), /uses: 1\nlast: \d{4}-\d{2}-\d{2}\nrated_good: 0/);
  fs.writeFileSync(first.feedbackFile, read(first.feedbackFile).replace('rated_bad: 0', 'rated_bad: 2').replace('## Improvements', '## Improvements\n- Follow consumers').replace('## Notes', '## Notes\n- User said the result missed a consumer'));
  const second = engine.start(event);
  assert.doesNotMatch(second.context, /CORE_RULES|User said/);
  assert.match(second.context, /Follow consumers/);
  assert.match(read(first.feedbackFile), /uses: 2/);
  assert.match(read(first.feedbackFile), /rated_bad: 2/);
  const third = engine.start({ ...event, skill: 'ship' });
  assert.equal(third.sessionFile, first.sessionFile);
  assert.match(read(third.sessionFile), /^skills: review, ship/);
});

test('all three tools share facts and summaries but have independent session identities', t => {
  const { project, engine, event } = fixture(t);
  const first = engine.start(event);
  fs.appendFileSync(first.sessionFile, '\n## Summary\n- Reviewed PR 42\n- Open: fix consumer\n');
  fs.appendFileSync(path.join(project, '.alfred', 'memory.md'), '- [git] PRs target develop\n');
  engine.lifecycle({ ...event, action: 'session-end' });
  for (const tool of ['copilot', 'codex']) {
    const result = engine.start({ ...event, tool });
    assert.match(result.context, /PRs target develop/);
    assert.match(result.context, /Reviewed PR 42/);
    assert.notEqual(result.sessionFile, first.sessionFile);
    assert.match(path.basename(result.sessionFile), new RegExp(`-${tool}-`));
    engine.lifecycle({ ...event, tool, action: 'session-end' });
    assert.equal(fs.existsSync(result.sessionFile), false);
  }
  assert.equal(fs.existsSync(first.sessionFile), true);
  assert.match(read(first.feedbackFile), /uses: 3/);
});

test('Claude, Copilot CLI, and VS Code payload shapes return the correct envelopes', t => {
  const { project, engine } = fixture(t);
  const claude = { cwd: project, session_id: 'c', tool_name: 'Skill', tool_input: { skill: 'alfred:review' }, hook_event_name: 'PreToolUse', tool_use_id: 'call-1' };
  const result = JSON.parse(handle('skill-start', claude, 'claude', engine));
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(result.hookSpecificOutput.additionalContext, /memory ready: review/);
  handle('skill-start', claude, 'claude', engine);
  assert.match(read(path.join(project, '.alfred', 'feedback', 'review.md')), /uses: 1/);
  const copilot = { cwd: project, sessionId: 'p', toolName: 'skill', toolArgs: JSON.stringify({ skill: 'alfred:review' }), timestamp: 42 };
  assert.match(JSON.parse(handle('skill-start', copilot, 'copilot', engine)).additionalContext, /CORE_RULES/);
  const vscode = { ...claude, session_id: 'v', tool_name: 'skill', hook_event_name: 'PostToolUse' };
  assert.equal(JSON.parse(handle('skill-start', vscode, 'copilot', engine)).hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.equal(handle('skill-start', { ...claude, tool_name: 'Bash' }, 'claude', engine), '');
  assert.equal(handle('skill-start', { ...claude, tool_input: { skill: 'other:review' } }, 'claude', engine), '');
  assert.equal(handle('skill-start', { ...claude, tool_input: { skill: '../../outside' } }, 'claude', engine), '');
  assert.equal(handle('skill-start', null, 'claude', engine), '');
  assert.equal(handle('skill-start', { ...copilot, toolArgs: 'broken' }, 'copilot', engine), '');
});

test('all opt-outs leave untouched workspaces untouched', t => {
  const { project, engine, event } = fixture(t);
  assert.equal(engine.start({ ...event, skill: 'disabled' }), null);
  assert.equal(engine.start({ ...event, skill: 'unknown' }), null);
  assert.equal(fs.existsSync(path.join(project, '.alfred')), false);
  const previous = process.env.ALFRED_MEMORY;
  try { process.env.ALFRED_MEMORY = 'off'; assert.equal(engine.start(event), null); }
  finally { if (previous === undefined) delete process.env.ALFRED_MEMORY; else process.env.ALFRED_MEMORY = previous; }
  assert.equal(fs.existsSync(path.join(project, '.alfred')), false);
  fs.mkdirSync(path.join(project, '.alfred'));
  fs.writeFileSync(path.join(project, '.alfred', 'config.json'), '{"memory":false}');
  assert.equal(engine.start(event), null);
  assert.deepEqual(fs.readdirSync(path.join(project, '.alfred')), ['config.json']);
});

test('root selection handles git files, nested notebooks and excluded folders', t => {
  const { dir, project } = fixture(t);
  const child = path.join(project, 'package'); fs.mkdirSync(child);
  assert.equal(resolveRoot(child), project);
  fs.mkdirSync(path.join(child, '.alfred'));
  assert.equal(resolveRoot(child), child);
  const worktree = path.join(dir, 'worktree'); fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: elsewhere');
  assert.equal(resolveRoot(worktree), worktree);
  assert.equal(resolveRoot(project, { home: project }), null);
  assert.equal(resolveRoot(project, { temp: project }), null);
  assert.equal(resolveRoot(path.parse(project).root), null);
  assert.equal(resolveRoot('relative/path'), null);
  assert.equal(resolveRoot(path.join(project, 'missing')), null);
});

test('caps bound injected content and refresh reloads facts after compaction', t => {
  const { project, engine, event } = fixture(t);
  const first = engine.start(event);
  fs.writeFileSync(path.join(project, '.alfred', 'memory.md'), '- FACT_ONE\n- FACT_TWO\n- FACT_THREE\n');
  fs.writeFileSync(path.join(project, '.alfred', 'config.json'), '{"caps":{"memoryLines":2}}');
  engine.lifecycle({ ...event, action: 'session-start', source: 'compact' });
  const result = engine.start({ ...event, skill: 'ship' });
  assert.match(result.context, /CORE_RULES[\s\S]*FACT_TWO/);
  assert.doesNotMatch(result.context, /FACT_THREE/);
  assert.match(result.context, /Memory capped/);
  assert.equal(result.sessionFile, first.sessionFile);
  fs.writeFileSync(path.join(project, '.alfred', 'config.json'), '{"caps":{"memoryLines":-1}}');
  assert.throws(() => engine.start(event), /Invalid memory cap/);
});

test('ended sessions prune to configured retention; active sessions survive', t => {
  const { project, engine, event } = fixture(t);
  const active = engine.start(event);
  fs.writeFileSync(path.join(project, '.alfred', 'config.json'), '{"caps":{"maxSessions":3}}');
  for (let i = 0; i < 5; i++) {
    const input = { ...event, sessionId: `other-${i}` };
    const result = engine.start(input);
    fs.appendFileSync(result.sessionFile, '\n## Summary\n- Done\n');
    engine.lifecycle({ ...input, action: 'session-end' });
  }
  assert.equal(fs.readdirSync(path.join(project, '.alfred', 'sessions')).length, 3);
  assert.equal(fs.existsSync(active.sessionFile), true);
  engine.lifecycle({ ...event, action: 'session-end' });
  assert.equal(fs.existsSync(active.sessionFile), false);
});

test('unsafe links and corrupt state never write outside the notebook', t => {
  const { dir, project, engine, event } = fixture(t);
  const outside = path.join(dir, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(project, '.alfred'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => engine.start(event), /Linked/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(project, '.alfred'));
  engine.start(event);
  const stateDir = path.join(project, '.alfred', '.state');
  const stateFile = path.join(stateDir, fs.readdirSync(stateDir)[0]);
  fs.writeFileSync(stateFile, JSON.stringify({ file: '../../outside', skills: [], events: [] }));
  assert.throws(() => engine.start(event), /Invalid Alfred session state/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('hook install and uninstall preserve unrelated handlers even inside shared groups', t => {
  const { dir } = fixture(t);
  for (const tool of ['claude', 'copilot', 'codex']) {
    const added = registrations(tool, dir);
    const user = { theme: 'dark', hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'user-script' }] }] } };
    const once = mergeHooks(user, added, dir);
    assert.deepEqual(mergeHooks(once, added, dir), once);
    assert.deepEqual(mergeHooks(once, {}, dir), user);
    const file = path.join(dir, `${tool}.json`);
    fs.writeFileSync(file, JSON.stringify(user));
    install(tool, { file, root: dir });
    const content = read(file);
    install(tool, { file, root: dir });
    assert.equal(read(file), content);
    install(tool, { file, root: dir, remove: true });
    assert.equal(JSON.parse(read(file)).theme, 'dark');
    assert.equal(JSON.parse(read(file)).hooks.SessionStart[0].hooks[0].command, 'user-script');
  }
  const own = registrations('claude', dir).PreToolUse[0].hooks[0];
  const config = { hooks: { PreToolUse: [{ matcher: 'Skill', hooks: [own, { type: 'command', command: 'keep-me' }] }] } };
  assert.equal(mergeHooks(config, {}, dir).hooks.PreToolUse[0].hooks[0].command, 'keep-me');
  assert.throws(() => mergeHooks({ hooks: [] }, {}, dir), /Invalid hooks/);
});

test('concurrent processes preserve every usage increment', async t => {
  const { event, paths, project } = fixture(t);
  const moduleFile = require.resolve('../src/memory/engine');
  const script = 'const {createEngine}=require(process.argv[1]);createEngine(JSON.parse(process.argv[2])).start(JSON.parse(process.argv[3]));';
  await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, moduleFile, JSON.stringify(paths), JSON.stringify({ ...event, sessionId: `parallel-${i}` })], { windowsHide: true });
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  })));
  assert.match(read(path.join(project, '.alfred', 'feedback', 'review.md')), /uses: 8/);
});

test('oversized write-back files and malformed counters are preserved instead of truncated', t => {
  const { engine, event } = fixture(t);
  const result = engine.start(event);
  const large = 'uses: 1\nlast: today\n' + 'x'.repeat(70000);
  fs.writeFileSync(result.feedbackFile, large);
  assert.throws(() => engine.start(event), /exceeds 64 KiB/);
  assert.equal(read(result.feedbackFile), large);
  fs.writeFileSync(result.feedbackFile, 'uses: invalid\nlast: today\n');
  assert.throws(() => engine.start(event), /Invalid feedback counters/);
  assert.equal(read(result.feedbackFile), 'uses: invalid\nlast: today\n');
});

test('hook process fails open on malformed stdin', () => {
  const result = spawnSync(process.execPath, [require.resolve('../hooks/alfred-hook'), 'skill-start', 'claude'], { input: '{broken', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Alfred memory skipped/);
});
