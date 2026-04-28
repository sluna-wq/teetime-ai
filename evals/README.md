# TeeTime AI Evals

This directory contains product evals for TeeTime AI. The suite follows the Anthropic eval pattern: task inputs, captured transcript/tool events, deterministic graders where possible, and browser/computer-use journeys where the product depends on third-party booking flows.

## Run

```bash
npm run eval
```

Default mode is fixture mode. It uses deterministic tee-time data and scripted agent outputs to verify the grader logic and product invariants quickly.

To run against a live local or staging app:

```bash
EVAL_MODE=local EVAL_BASE_URL=http://localhost:3000 npm run eval
```

Live mode posts task messages to `/api/chat`, captures SSE events, and grades the real tool calls, tool results, final text, and recommendations.

Booking journeys are separate from URL reachability. They test whether a browser agent can follow a course-specific booking path and reach the booking surface with the intended date/course context:

```bash
npm run eval:booking
```

Default booking mode validates that each journey has an unambiguous goal, target, and no-submit boundary.

Browser mode actually opens third-party sites and attempts the journey:

```bash
BOOKING_EVAL_MODE=browser npm run eval:booking
```

The browser agent must stop before login, payment, checkout, or final reservation submission.

## What The Suite Checks

- Search tool calls use the expected date, time, holes, price, player count, and location.
- Returned tee times satisfy the query constraints.
- Recommended slot IDs exist in the returned result set.
- Chat text is grounded in returned tee times and does not claim availability when no result exists.
- Booking journey specs describe the intended course, date, time, party size, and no-submit stopping boundary.
- Browser booking mode checks that the agent reaches a booking-related surface, sees the right course context, and attempts to reach or set the target date.

## Adding Tasks

Add chat/search tasks to `evals/tasks.json`. Add browser booking journeys to `evals/booking-journeys.json`. Keep each task unambiguous enough that two reviewers would agree on pass/fail.

Use fixture mode for stable regression checks. Use local mode before model upgrades or prompt changes. Use browser booking mode before demos and after changing course URLs or booking behavior.
