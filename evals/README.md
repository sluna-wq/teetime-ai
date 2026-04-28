# TeeTime AI Evals

This directory contains product evals for TeeTime AI. The suite follows the Anthropic eval pattern: task inputs, captured transcript/tool events, deterministic graders where possible, and subjective checks only where needed.

## Run

```bash
npm run eval
```

Default mode is fixture mode. It uses deterministic tee-time data and scripted agent outputs to verify the grader logic and product invariants quickly.

To run against a live local or staging app:

```bash
EVAL_MODE=local EVAL_BASE_URL=http://localhost:3000 npm run eval
```

Live mode posts task messages to `/api/chat`, captures SSE events, and grades the real tool calls, tool results, final text, recommendations, and links.

Live URL checking is opt-in because it touches third-party sites:

```bash
EVAL_CHECK_LINKS=1 npm run eval
```

## What The Suite Checks

- Search tool calls use the expected date, time, holes, price, player count, and location.
- Returned tee times satisfy the query constraints.
- Recommended slot IDs exist in the returned result set.
- Chat text is grounded in returned tee times and does not claim availability when no result exists.
- Reserve links are syntactically valid and use allowed booking destinations.
- Optional live link checks verify that booking URLs are reachable.

## Adding Tasks

Add tasks to `evals/tasks.json`. Keep each task unambiguous enough that two reviewers would agree on pass/fail.

Use fixture mode for stable regression checks. Use local mode before demos, model upgrades, prompt changes, or scraper changes.
