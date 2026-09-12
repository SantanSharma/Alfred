# Shared memory investigation and implementation plan

## 1. Understanding
Implement the five `Temp/alfred-memory-*` requirements for Claude Code, Copilot and
Codex, in terminal and VS Code: shared context, project sessions, usage counters,
user-driven feedback, opt-outs, bounded storage, and one-command setup.

## 2. Current implementation
Zero-dependency CommonJS Node CLI. `skills/` is local/gitignored; `plugin/` is generated.
Memory and knowledge are placeholders. There were no automated tests.

## 3. Code flow
`bin/alfred.js` -> `src/cli.js` -> `commands/sync.js` -> `core/pluginBuild.js`
-> `skillsIndex.js`/`skills.js` -> `integrations/{claude,copilot,codex}.js`.
Claude and Copilot use directory links; Codex gets one link per generated skill.

## 4. Relevant code
Build/index must preserve `memory: false` and generate the common startup instructions.
Integration modules install owned hooks. New `src/memory/` modules own storage and
event normalization; `hooks/alfred-hook.js` is the fail-open stdin/stdout adapter.
Both teardown scripts need symmetric hook removal.

## 5. Existing patterns
Keep zero dependencies, synchronous small-file operations, absolute install paths,
step-level sync logging, and validation before generation. Preserve unrelated settings.
Do not write native project instruction files or edit source skills automatically.

## 6. Related changes
`ef910a4` added Codex links; `a271c6b` updated memory proposals for Codex.
Pre-existing staged edits to the wiring proposal and deletion of the earlier proposal
are user work and remain untouched.

## 7. Impact analysis
Generated skills gain a startup step. Memory-disabled skills remain unchanged.
User hook files gain only Alfred-owned entries; project `.alfred/` self-ignores.
No network service or model call is needed by the memory engine.
Existing settings, source skills, ratings, personal memory and workspace memory survive sync.

## 8. Edge cases / risks
Official docs checked 2026-09-12:
- [Claude hooks](https://code.claude.com/docs/en/hooks): direct slash expansion bypasses
  the Skill PreToolUse hook. Generated startup instructions cover this path and old versions.
- [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference): camelCase
  payloads and postToolUse additionalContext; VS Code-compatible payloads differ.
- [VS Code hooks](https://code.visualstudio.com/docs/agents/reference/hooks-reference):
  snake_case payloads and hookSpecificOutput. User hook discovery can be overridden.
- [Codex hooks](https://learn.chatgpt.com/docs/hooks): lifecycle hooks exist, but no
  dedicated skill-load event is documented. Hooks require native review/trust.
- [Codex skills](https://learn.chatgpt.com/docs/build-skills): instructions can call scripts,
  including through symlinked user skills in CLI and IDE.

Therefore the generated startup step is the portable path on every host; native skill
hooks are an optimization. If context already contains the matching invocation receipt,
the startup step is skipped. The engine handles repeated delivery IDs idempotently.
Fallback sessions use a generated token reused by the agent when the host does not
expose a session ID. Completion writes remain instruction-driven, as requested.
Sandbox permissions and hook trust remain controlled by each host.

## 9. Open questions
No blocking product question. Use the specified defaults (20 global facts, 40 project
facts, 8 improvements, 2 recent summaries, 30 retained sessions). Automated checks can
prove storage/protocol behavior; interactive use in each installed editor still needs
host-level verification. Do not describe simulated hook tests as live editor tests.

## 10. Recommended approach and acceptance checks
1. Implement safe root selection, local layout, bounded reads, sessions and feedback.
2. Normalize Claude/Copilot hook payloads; support Codex lifecycle and portable CLI start.
3. Generate common startup instructions without changing source skill bodies/frontmatter.
4. Merge hooks on sync and remove only owned hooks on teardown; keep all memory.
5. Test malformed payloads, path traversal, nested roots/worktrees, opt-outs, repeated
   events, concurrent counters, cleanup, caps, and handoff between all three tools.
6. Build real skills, sync installed tools, and publish precise validation/host limitations.

## Validation record

- `npm test`: automated storage, hook protocol, build and CLI tests pass on Windows.
- `node bin/alfred.js sync`: all 12 skills built; Claude, Copilot and Codex hooks/links configured.
- Second sync: each hook configuration reported unchanged; no duplicate registrations.
- Existing staged requirement edits/deletion were preserved.
- Native host events and model write-back inside all six interactive host surfaces
  have not been end-to-end exercised in this session. Generated startup and protocol
  tests are executable integration checks, not proof of model compliance in an editor.
- Codex may require native hook trust via `/hooks`; generated skill startup does not
  require that lifecycle hook. Reload skills/restart existing editors after sync.
