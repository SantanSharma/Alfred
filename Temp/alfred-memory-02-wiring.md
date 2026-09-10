# 02. Wiring: how the pieces connect, step by step

## What a hook is, in plain words

A hook is a doorbell. The AI tool rings it at fixed moments: session starts, a tool is
about to run, a tool just ran, session ends. When it rings, the tool runs a command you
chose, gives it a small JSON on stdin (who rang, from which folder, which tool), and
reads a small JSON back. Some doorbells let you hand the AI a note ("additional
context"). Some only let you say yes or no. We only care about the ones that let us
hand over a note, plus one at the end for cleanup.

Both Claude Code and Copilot CLI have doorbells. Different names, same idea.

## The one script

`Alfred/hooks/alfred-hook.js`. Node, zero dependencies, one file. Called as:

```
node "<Alfred>/hooks/alfred-hook.js" session-start
node "<Alfred>/hooks/alfred-hook.js" skill-start
node "<Alfred>/hooks/alfred-hook.js" session-end
```

It reads stdin, sees whether the JSON looks like Claude (`tool_name`, `session_id`) or
Copilot (`toolName`, `sessionId`), does its work, prints the shape that tool expects.
Same script, both tools, both CLI and VS Code.

## Which doorbell does what

| Moment | Claude Code event | Copilot event | Script action | Note handed to AI? |
|---|---|---|---|---|
| Session opens | `SessionStart` | `sessionStart` | `session-start` | One line, only if `.alfred/` already exists |
| Alfred skill called | `PreToolUse`, matcher `Skill` | `postToolUse`, matcher `^skill$` | `skill-start` | Yes, the main injection |
| Session closes | `SessionEnd` | `sessionEnd` | `session-end` | No. File cleanup only |

Why Copilot uses `postToolUse` and not `preToolUse`: Copilot's `preToolUse` can only
allow, deny, or edit arguments. It cannot hand over a note. `postToolUse` can. And for
the `skill` tool, "post" means "the skill text was just loaded", the AI has not started
working yet. So it is the same moment in practice.

## What arrives on stdin (real shapes)

Claude Code, skill called:

```json
{
  "session_id": "3f2a...",
  "cwd": "E:\\code\\V2Web",
  "hook_event_name": "PreToolUse",
  "tool_name": "Skill",
  "tool_input": { "skill": "pr-code-review" }
}
```

Copilot, skill called:

```json
{
  "sessionId": "9c1d...",
  "timestamp": 1788950000000,
  "cwd": "E:\\code\\V2Web",
  "toolName": "skill",
  "toolArgs": { "skill": "pr-code-review" }
}
```

Both carry the two things the script needs: which folder, which skill.

## What the script prints back

Claude Code:

```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "additionalContext": "...text..." } }
```

Copilot:

```json
{ "additionalContext": "...text..." }
```

If the script decides to do nothing (not an Alfred skill, memory off, bad folder), it
prints nothing and exits 0. The tool carries on as if no hook existed.

## What `skill-start` does, in order

1. Read stdin. Work out tool and skill name. Strip `alfred:` if present.
2. Open `Alfred/config/skills-index.json`. If the skill is not in it, stop. Not ours.
   If the skill has `memory: false`, stop.
3. Find the project root from `cwd`:
   walk up looking for an existing `.alfred/`; else the first `.git`; else `cwd`.
   If the root is your home folder, a drive root, or the temp folder, stop.
4. If `.alfred/` does not exist, create it: `.gitignore` with `*`, `README.md`,
   `memory.md`, `sessions/`, `feedback/`, `.state/`.
5. Open or create `feedback/<skill>.md`. Bump `uses:` by one, set `last:` to today.
6. Open or create this session's file in `sessions/` (name from date, time, tool).
   Append the skill name to its `skills:` line. Remember the mapping in `.state/`.
7. Build the note:
   first Alfred skill this session: core rules + global memory + project memory +
   this skill's Improvements + last two session summaries;
   later skills: this skill's Improvements + one reminder line.
8. Print the note in the tool's JSON shape. Done. Around 100 to 200 ms.

## What `session-end` does

1. Look up this session's file in `.state/`.
2. If it has only the header and no `## Summary`, delete it. No empty notes.
3. Keep the newest 30 files in `sessions/`, delete the rest.
4. Remove the `.state/` entry.

No AI involved. Must finish fast; Claude gives session-end hooks very little time.

## How `alfred sync` installs the doorbells

Today `alfred sync` does: build `plugin/`, junction for Claude, marketplace for Copilot.
Add two steps, both idempotent (safe to run again and again):

Claude Code: merge three entries into `~/.claude/settings.json` under `hooks`.
Each entry's command contains the string `alfred-hook.js`, so a re-run finds and
replaces its own entries and never duplicates. `teardown.ps1` removes them by the same
string. This is exactly how caveman is wired on this machine right now.

```json
"PreToolUse": [
  { "matcher": "Skill",
    "hooks": [ { "type": "command",
                 "command": "node \"E:\\...\\Alfred\\hooks\\alfred-hook.js\" skill-start",
                 "timeout": 10 } ] }
]
```

Copilot: write `~/.copilot/hooks/alfred.json`. User-level hook file, documented
location, independent of plugin version.

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [ { "type": "command",
      "powershell": "node \"E:\\...\\Alfred\\hooks\\alfred-hook.js\" session-start",
      "bash": "node \"E:/.../Alfred/hooks/alfred-hook.js\" session-start",
      "timeoutSec": 10 } ],
    "postToolUse": [ { "type": "command", "matcher": "^skill$",
      "powershell": "node \"E:\\...\\Alfred\\hooks\\alfred-hook.js\" skill-start",
      "bash": "node \"E:/.../Alfred/hooks/alfred-hook.js\" skill-start",
      "timeoutSec": 10 } ],
    "sessionEnd": [ { "type": "command",
      "powershell": "node \"E:\\...\\Alfred\\hooks\\alfred-hook.js\" session-end",
      "bash": "node \"E:/.../Alfred/hooks/alfred-hook.js\" session-end",
      "timeoutSec": 5 } ]
  }
}
```

Alternative for Copilot: ship `plugin/hooks.json` inside the live plugin instead.
Plugin hooks are documented too. Pick the user-level file first because it does not
depend on the plugin runtime version; switch later if it proves unnecessary.

## VS Code, both tools

Claude Code in VS Code is the same program as the terminal one, same `settings.json`.
Nothing extra.

Copilot in VS Code bundles its own older Copilot runtime (1.0.81 today). Whether it
reads `~/.copilot/hooks/` is the single open question in this design. Test: install the
hook file, open Copilot Chat in VS Code, run `/alfred idea-grill`, check whether
`.alfred/feedback/idea-grill.md` got `uses: 1`. If not, VS Code users still get the
folder and the files (created by CLI sessions), just no automatic injection until VS
Code ships a newer runtime.

## How the AI writes back

No hook does this. The core rules text (see file 03) tells the AI: when the skill's
work produces a real result, append up to six lines under `## Summary` in the session
file; update `memory.md` only for facts that stay true and matter later; touch the
feedback file only when the user signals good, bad, or asks for a change. The AI does
this with its normal file tools. The hook already told it the exact paths.

Why not a hook at the end too: Claude's `Stop` fires after every single reply, Copilot's
`agentStop` likewise. Hooking that means either nagging the AI every turn or paying for
an extra model call every turn. Instruction once at the start is cheaper and enough.
Revisit only if summaries turn out to be skipped often.

## Files touched in the Alfred repo

```
Alfred/
  hooks/alfred-hook.js               new
  knowledge/alfred-core.md           new, committed, the rules every skill gets
  memory/global.md                   new, gitignored (already covered by memory/*), your facts
  src/integrations/claude.js         + merge/remove hooks in ~/.claude/settings.json
  src/integrations/copilot.js        + write/remove ~/.copilot/hooks/alfred.json
  src/core/skills.js, skillsIndex.js + read optional `memory: false` frontmatter into the index
  teardown.ps1                       + remove both hook installs
  README.md                          + one section
```

No skill file changes. New skills get memory automatically because the hook keys on the
skill tool, not on skill content.
