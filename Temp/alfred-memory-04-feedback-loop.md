# 04. The self-improving loop, without self-modifying skills

## What you asked for

Collect facts about how each skill performs, in every repo where it is used. Every two
weeks or every month, a human reads the facts and improves the skill by hand. No
automatic skill edits for now. The collection exists so that the manual improvement is
based on evidence, not on memory of "I think it did that wrong once".

## The loop, in five steps

```
1. Skill runs            hook writes  uses +1, last = today
2. You react             you say "wrong", "good", "next time also check X"
3. AI records            one line in feedback/<skill>.md, in the right section
4. Time passes           facts accumulate in every project's .alfred/feedback/
5. You review            read the report cards, edit the skill in Alfred/skills/, alfred sync
```

Step 1 is code. Step 3 is the AI following the core rules. Steps 2 and 5 are you.
Nothing edits a skill without a human.

## What is a fact and what is not

Facts the hook records (always true, no judgement):

- how many times the skill was used in this project
- when it was last used
- which tool called it: Claude, Copilot, or Codex (visible in the session file name once
  that tool's hook path is active)

Facts the AI records, only on your explicit signal:

- `rated_good` +1 when you clearly approve the result
- `rated_bad` +1 when you clearly say it was wrong or missed something
- a dated line under `## Notes` saying what happened, one line
- a line under `## Improvements` when you ask for a behaviour change, or when the same
  note appears twice

Not facts, never recorded:

- the AI's own opinion of how well it did
- "success" inferred from the absence of complaint
- long explanations, transcripts, code

Why this strictness: a model grading its own work produces optimistic noise. If the
numbers cannot be trusted, the monthly review is built on sand. Fewer, honest numbers
beat many hollow ones. `uses` will be the most useful number for a long time. It tells
you which skills are alive and which are dead weight.

## One report card, end to end

Day 1, first use in V2Web. Hook creates:

```
# pr-code-review
uses: 1
last: 2026-09-10
rated_good: 0
rated_bad: 0

## Improvements

## Notes
```

Day 3, you say "you missed the Angular service that consumes this". AI appends:

```
rated_bad: 1
## Notes
- 2026-09-12 missed dependency in Angular service consuming the changed API
```

Day 9, same thing happens again. AI increments `rated_bad`, adds a note, and because it
is the second time, adds:

```
## Improvements
- Follow the dependency chain into Angular consumers before finalising
```

Day 30, your review. You open the skill, add that check to its process, run
`alfred sync`. Claude, Copilot, and Codex get the better skill. You may clear the
Improvements line or leave it with a date so the next review knows it was applied.

## The review, done by hand for now

Every project you worked in has `.alfred/feedback/`. Reading them one by one is fine
for a handful of projects. For the review:

1. For each skill: sum `uses` across projects. Zero for 90 days means archive it.
2. Read `## Improvements` across projects. Repeated asks are the real signal.
3. Read `## Notes` for the skills you care about. Look for the same failure in
   different repos; that is a skill bug, not a project quirk.
4. Edit the skill in `Alfred/skills/`. `alfred sync`.

Later, one small command does step 1 and 2 for you: `alfred feedback`, which reads the
feedback folders of the workspaces the hook has seen (it can keep a list in
`Alfred/memory/workspaces.json`) and prints one table. Not needed for the MVP.

## What stays out, on purpose

- Auto-editing skills from feedback. Roadmap item 11, last, with a human gate.
- Success percentages, scores, dashboards. A text file you read in ten seconds is the
  interface.
- Sending anything anywhere. Every file stays on your disk.
- Per-run logs. The session file already says which skills ran; that is enough
  telemetry.

## Confidence

| Claim | Confidence |
|---|---|
| `uses` and `last` counters are accurate | 95% for hook-proven tools; Codex reaches the same confidence after its hook event is verified |
| Ratings and notes get written when you signal | 70% (instruction-driven; the AI may miss subtle signals. Saying "rate that bad" explicitly always works) |
| Improvement lines point at real skill defects after a month | 65% (needs a few repeats to separate skill bugs from one-off project quirks) |
| The loop stays cheap | 90% (a few lines per event, one small file per skill per project) |
