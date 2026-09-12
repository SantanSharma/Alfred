# 05. System design (mermaid), pros and cons, confidence

## 1. Components and how they connect

```mermaid
flowchart TB
    subgraph User["You"]
        U[Type /alfred:skill]
    end

    subgraph Tools["AI tools (the hands)"]
        CC[Claude Code<br/>CLI + VS Code]
        CP[Copilot<br/>CLI + VS Code]
      CX[Codex<br/>VS Code + shared skills root]
    end

    subgraph AlfredRepo["Alfred repo (the brain, one copy)"]
        SK[skills/*.md]
        HK[hooks/alfred-hook.js]
        KN[knowledge/alfred-core.md<br/>committed rules]
        GM[memory/global.md<br/>gitignored, your facts]
        IDX[config/skills-index.json]
        SYNC[alfred sync]
        PLG[plugin/ generated]
    end

    subgraph HookInstall["Hook registrations (written by alfred sync)"]
        CS[~/.claude/settings.json<br/>hooks: SessionStart, PreToolUse Skill, SessionEnd]
        CH[~/.copilot/hooks/alfred.json<br/>sessionStart, postToolUse skill, sessionEnd]
      AS[~/.agents/skills/alfred-&lt;skill&gt;<br/>Codex skill links]
    end

    subgraph Workspace["Any project folder"]
        WS[".alfred/<br/>memory.md · sessions/ · feedback/ · .state/"]
        TN[CLAUDE.md / copilot-instructions<br/>team-owned, Alfred never writes]
    end

    U --> CC
    U --> CP
    U --> CX
    SYNC --> PLG
    SYNC --> CS
    SYNC --> CH
    SYNC --> AS
    SK --> PLG
    PLG --> CC
    PLG --> CP
    AS --> CX
    CS --> CC
    CH --> CP
    CC -- rings hook --> HK
    CP -- rings hook --> HK
    CX -.hook shape TBD.-> HK
    HK --> IDX
    HK --> KN
    HK --> GM
    HK <--> WS
    HK -- additionalContext --> CC
    HK -- additionalContext --> CP
    HK -.additionalContext when supported.-> CX
    CC -- writes summary, notes --> WS
    CP -- writes summary, notes --> WS
    CX -- writes summary, notes --> WS
    TN -.loaded by tool itself.-> CC
    TN -.loaded by tool itself.-> CP
    TN -.loaded by tool itself.-> CX
```

## 2. One skill call, Claude Code

```mermaid
sequenceDiagram
    actor You
    participant CC as Claude Code
    participant H as alfred-hook.js
    participant A as Alfred repo<br/>(knowledge, memory, index)
    participant W as project/.alfred/

    You->>CC: /alfred:pr-code-review
    CC->>H: PreToolUse {tool_name: Skill, tool_input.skill, cwd}
    H->>A: is skill in skills-index.json? memory off?
    H->>W: find root from cwd, create .alfred/ if missing
    H->>W: feedback/pr-code-review.md  uses+1, last=today
    H->>W: sessions/<date-time-claude>.md  skills: += pr-code-review
    H->>A: read alfred-core.md, global.md
    H->>W: read memory.md, Improvements, last 2 summaries
    H-->>CC: {additionalContext: rules + memory + report card + sessions}
    CC->>CC: loads skill text, works with your repo
    CC->>You: result
    You->>CC: "good" / "you missed X" (optional)
    CC->>W: append ## Summary lines, update memory.md if a fact qualifies, note in feedback
    Note over CC,W: session ends later
    CC->>H: SessionEnd {session_id, cwd}
    H->>W: delete empty session file, keep newest 30, clear .state
```

## 3. Same call, Copilot (only the event names differ)

```mermaid
sequenceDiagram
    actor You
    participant CP as Copilot CLI / VS Code
    participant H as alfred-hook.js
    participant W as project/.alfred/

    You->>CP: /alfred pr-code-review
    CP->>CP: calls tool "skill" {skill: pr-code-review}
    CP->>H: postToolUse {toolName: skill, toolArgs.skill, cwd}
    Note right of H: identical work to the Claude path
    H-->>CP: {additionalContext: ...}
    CP->>CP: works with the skill text
    CP->>You: result
    CP->>W: summary, memory, feedback per rules
    CP->>H: sessionEnd
    H->>W: cleanup
```

  Codex uses the same Alfred skill files through `~/.agents/skills/alfred-<skill>` and the
  same `.alfred/` workspace files. The missing proof is the exact Codex hook event that can
  inject `additionalContext` at skill start; until that is confirmed, Codex is in scope for
  skill delivery and manual file memory, with automatic memory injection pending.

## 4. Memory layers and read order

```mermaid
flowchart LR
    subgraph A["Layer A · Alfred global"]
        A1[knowledge/alfred-core.md]
        A2[memory/global.md]
    end
    subgraph B["Layer B · this workspace"]
        B1[.alfred/memory.md]
        B2[.alfred/feedback/skill.md<br/>Improvements only]
        B3[.alfred/sessions/ last 2]
    end
    subgraph C["Layer C · tool native, read-only for Alfred"]
        C1[CLAUDE.md]
        C2[copilot-instructions.md]
      C3[AGENTS.md]
      C4[Claude / Copilot / Codex own memory]
    end
    A1 --> A2 --> B1 --> B2 --> B3 --> SKILL[skill text]
    C1 -.already in context.-> SKILL
    C2 -.already in context.-> SKILL
    C3 -.already in context.-> SKILL
    C4 -.already in context.-> SKILL
    SKILL --> WORK[work]
```

Priority while an Alfred skill runs: A and B over C, stated in `alfred-core.md`. Outside
Alfred skills, nothing is injected and C behaves as usual.

## 5. Decision tree inside the hook (why memory is not created everywhere)

```mermaid
flowchart TD
    S[hook rings] --> Q1{Alfred skill?<br/>in skills-index.json}
    Q1 -- no --> X[exit 0, print nothing]
    Q1 -- yes --> Q2{skill memory: false<br/>or ALFRED_MEMORY=off?}
    Q2 -- yes --> X
    Q2 -- no --> R[find root: nearest .alfred/ → .git → cwd]
    R --> Q3{root is home,<br/>drive root, or temp?}
    Q3 -- yes --> X
    Q3 -- no --> Q4{.alfred/ exists?}
    Q4 -- no --> M[create layout, self-ignore]
    Q4 -- yes --> C[count, session, build note]
    M --> C
    C --> Q5{first Alfred skill<br/>this session?}
    Q5 -- yes --> F[full note ~1.8k tokens]
    Q5 -- no --> D[delta note ~200 tokens]
```

## 6. Feedback loop

```mermaid
flowchart LR
    R[skill runs] --> H[hook: uses+1, last]
    R --> U{you react?}
    U -- "good / wrong / do X next time" --> N[AI: rating, Note, maybe Improvement]
    U -- silence --> Z[nothing recorded]
    H --> F[.alfred/feedback/skill.md<br/>in every project]
    N --> F
    F -- every 2 to 4 weeks --> REV[you read report cards]
    REV --> E[edit Alfred/skills/*.md]
    E --> SY[alfred sync]
    SY --> R
```

## 7. Install and uninstall path

```mermaid
flowchart LR
    I[npm install -g .] --> S[alfred sync]
    S --> P[build plugin/]
    S --> J[junction ~/.claude/skills/alfred]
    S --> MK[Copilot marketplace + install]
    S --> CX[link skills into ~/.agents/skills]
    S --> HC[merge 3 hooks into ~/.claude/settings.json]
    S --> HP[write ~/.copilot/hooks/alfred.json]
    T[teardown.ps1] --> RJ[remove junctions, Codex links, marketplace, global cmd]
    T --> RH[remove Alfred hook entries and hook file]
```

`alfred sync` stays the only command a user runs. Idempotent: run twice, same result.

## Pros and cons, your way of thinking

Pros

- One command, zero configuration. Memory appears where you work, hides from git.
- Same notebook for Claude, Copilot, and Codex. The Monday-Claude, Tuesday-Copilot,
  Wednesday-Codex amnesia problem is gone for anything Alfred skills touch once each
  tool has hook injection wired.
- Skills stay pure instructions. No skill needs to know about memory. New skills get it
  for free. Old hacks (`~/.claude/ship-pr/*.txt`, hardcoded Alfred path) can move into
  memory lines.
- Small by design: caps, one-line facts, empty sessions deleted, once-per-session
  injection. Costs less context than one skill file.
- Feedback numbers you can trust, because the only counters the machine writes are
  the ones it can know.
- Everything is plain text on your disk. Readable, diffable, deletable by hand.
- Fits the roadmap: this is items 4, 1, 6 together, and it prepares 9 (handoff) and 11
  (gated self-improvement) without building them.

Cons and open risks

- Copilot in VS Code may ignore user hooks on its bundled runtime. Test first. Worst
  case: VS Code Copilot reads files other sessions wrote, but does not get automatic
  injection until VS Code updates.
- Codex skills are already linked through `~/.agents/skills`, but Codex memory injection
  needs the hook event and payload shape proven before it can claim the same automation
  level as Claude and Copilot.
- Priority over CLAUDE.md is an instruction, not a lock. Rare conflicts are flagged,
  not prevented.
- Writing back depends on the AI obeying the rules. Expect occasional skipped
  summaries. Acceptable; a missing summary is cheaper than a nagging hook.
- One more memory location next to Claude's own auto-memory and CLAUDE.md. Kept
  narrow on purpose, but it is a fourth place.
- `git clean -fdx` wipes `.alfred/`. Operational memory, so acceptable; export later
  if it hurts.
- Two parallel sessions in one project can overwrite each other's memory line. Low
  damage, not worth a lock yet.
- Hook adds 100 to 200 ms per Alfred skill call. Not noticeable.

## Confidence per building block

| Block | Confidence | What would change it |
|---|---|---|
| Hook script, root detection, folder creation, counters | 95% | Pure Node fs work, no unknowns |
| Claude Code hooks via `settings.json`, CLI and VS Code | 95% | Already proven by caveman on this machine |
| Claude `PreToolUse` on `Skill` injecting `additionalContext` | 85% | Documented, one test confirms |
| Copilot CLI `postToolUse` on `skill` injecting `additionalContext` | 80% | Documented, one test confirms |
| Copilot user hooks read by VS Code's bundled runtime | 45% | The single real unknown; test in the first hour |
| Codex skill sync through `~/.agents/skills` links | 90% | Implemented in `src/integrations/codex.js`; one reload confirms visibility |
| Codex skill-start hook injection | 35% | Needs hook event and payload proof |
| Memory stays small and useful over months | 70% | Depends on rules text quality; caps catch the rest |
| Feedback becomes useful evidence for skill edits | 65% | Needs a few weeks of real use |
| Whole thing ships as MVP in one focused build | 85% | About 200 lines of hook, 40 lines of rules, small edits to two integration files |

## Build order (smallest first)

1. `hooks/alfred-hook.js` with `skill-start` only, Claude Code only, wired by hand in
   `settings.json`. Prove injection and folder creation. One hour.
2. Copilot CLI: write `~/.copilot/hooks/alfred.json` by hand. Prove `postToolUse`.
   Then test VS Code Copilot and record the answer. One hour.
3. Codex: run `alfred sync`, confirm `$alfred:<skill>` appears from
  `~/.agents/skills`, then capture whether Codex exposes a skill-start hook with
  injectable context. One hour.
4. `knowledge/alfred-core.md` and `memory/global.md`. Read a real skill run's output
   and tighten the rules once.
5. `session-start`, `session-end`, pruning.
6. Move the hand wiring into `alfred sync` and `teardown.ps1`. Update README and
   alfred-reference.
7. Use it for two weeks. Then decide on `alfred feedback`, tags, and the rest.
