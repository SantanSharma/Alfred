# 01. Big picture, explained simply

Read this first. Five minutes. The other files go deeper.

## The one-sentence idea

Every time you use an Alfred skill, a tiny script runs first, finds the project you are
in, reads a few small notes, hands them to the AI, and counts that the skill was used.
When the skill finishes, the AI writes a few lines back into those notes.

That is the whole feature. Everything else is detail.

## Think of it like a butler with a notebook

- Alfred is the butler. Claude and Copilot are two different bodies he can wear.
- Each house you visit (each project folder) gets its own small notebook, kept in a
  drawer in that house: `.alfred/`.
- Alfred also carries one pocket notebook everywhere: the `memory/` and `knowledge/`
  folders inside the Alfred repo. Rules that apply in every house go there.
- When you ring for a skill, Alfred opens the pocket notebook, then the house notebook,
  reads only the pages that matter, and gets to work.
- When the job is done he writes two or three lines: what he did, what he learned, what
  is still open. Not the whole conversation. Just what he would want to know next time.
- Every skill also has a report card in the house notebook. Alfred ticks "used" himself.
  You are the only one who can write "good" or "bad" on it.

Same notebook whether he is wearing the Claude body or the Copilot body. That is what
makes memory consistent across tools.

## Your four goals, and what each one becomes

| You said | It becomes | Mechanism |
|---|---|---|
| 1. Consistent memory for Claude and Copilot, VS Code and CLI | Plain `.md` files in `<project>/.alfred/` that both tools read and write | Both tools fire a hook when a skill is called. One script serves both. |
| 2. Self-improving skills, facts collected now, humans improve later | `.alfred/feedback/<skill>.md` in every project: use count, your ratings, notes, improvement asks | Hook bumps counters. AI writes notes only on your signal. You read them biweekly. |
| 3. Working-directory memory, sessions, feedback, with Alfred memory first | `.alfred/memory.md`, `.alfred/sessions/`, `.alfred/feedback/`, plus a priority rule in the contract text | Script finds the project root from the hook's `cwd`. Contract says "Alfred memory wins when running an Alfred skill". |
| 4. Shared knowledge and memory for all skills as pre-context | `Alfred/knowledge/alfred-core.md` (committed, the rules) and `Alfred/memory/global.md` (gitignored, your personal cross-project facts) | Hook injects both once per session, before any skill text. |

## What "simple for the user" means here

Zero setup beyond what exists today:

```
alfred sync
```

That command already connects skills. It will also install the hooks. Nothing to
configure, nothing to learn, no new command to remember. `.alfred/` appears by itself
the first time you use an Alfred skill in a project, and hides itself from git.

Optional knobs, only if you ever want them, all off by default:

- `ALFRED_MEMORY=off` environment variable: hooks do nothing.
- `.alfred/config.json` in a project: turn memory off for that project, or change caps.
- `memory: false` in a skill's frontmatter: that skill never touches memory.

## What the AI sees (so you can picture it)

When you type `/alfred:pr-code-review` for the first time in a session, the AI receives,
in this order, before the skill's own text:

1. Alfred core rules (about 40 lines, same everywhere).
2. Your global facts (a few lines, e.g. branch prefix).
3. This project's memory (up to 40 one-line facts).
4. This skill's report card, "Improvements" section only (up to 8 lines).
5. The last two session summaries (a few lines each).

Roughly 1,500 tokens. The skill file itself is bigger than that. Second skill in the
same session gets only item 4 plus one line saying "rules already loaded".

## Confidence, honest version

| Piece | Confidence | Why |
|---|---|---|
| Hook fires on skill call, Claude Code CLI and VS Code | 95% | Same program, same `settings.json`. Caveman hooks already work here this way. |
| Hook can inject text before the skill runs, Claude Code | 85% | Documented (`PreToolUse` `additionalContext`). Not yet tried by us. |
| Hook fires and injects, Copilot CLI | 80% | Documented (`postToolUse` `additionalContext`, user hooks in `~/.copilot/hooks/`). Not yet tried. |
| Copilot inside VS Code | 45% | VS Code ships an older Copilot runtime. Might not run user hooks. Needs one test. Fallback: folder convention still works, injection missing until VS Code updates. |
| Memory files stay small and useful | 70% | Depends on the contract text being obeyed. Caps and pruning in code catch the rest. |
| Feedback files become useful for skill improvement | 65% | Use counts and your notes are solid. Anything the AI grades itself is weak. |

Overall: the mechanism is sound and cheap. The one real unknown is Copilot in VS Code.
Test it in the first hour of building, before anything else.
