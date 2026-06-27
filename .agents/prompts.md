# Prompts

Copy these prompts into future AI sessions to get better results on this repo.

## Always Start

```text
Read AGENTS.md and .agents/brain.md first. Then inspect the closest relevant files before editing. Keep changes scoped and preserve existing patterns.
```

## Feature

```text
Read AGENTS.md and .agents/brain.md first. Implement <feature>. Reuse existing route/controller/model/UI patterns, update only the needed files, and run the smallest meaningful verification command.
```

## Bug Fix

```text
Read AGENTS.md and .agents/brain.md first. Investigate <bug>. Find the root cause, patch it, explain the changed behavior, and verify it.
```

## Code Review

```text
Review this change for bugs, auth/role regressions, financial logic mistakes, missing validation, and missing verification. Put findings first with file and line references.
```

## UI Work

```text
Read AGENTS.md and .agents/brain.md first. Update <screen>. Match the existing banking dashboard style, reuse shared UI components, and verify that text/layout works on desktop and mobile when browser tools are available.
```

## Backend Financial Logic

```text
Read AGENTS.md, .agents/brain.md, and .agents/checklists.md first. Modify <financial flow>. Inspect the related model, controller, route, and utility files before editing. Be explicit about balance, ledger, notification, approval, and status changes.
```

## Before Commit

```text
Check git status. Summarize changed files. Run relevant build/lint/server checks. Do not stage or commit unrelated user changes.
```

