# Sub-agent Orchestration

Use sub-agents as appropriate based on task complexity, dependencies, and opportunities for parallel execution.

* Delegate independent, non-trivial subtasks in parallel when doing so improves efficiency or result quality.
* Execute dependent subtasks in the required order.
* Avoid overlapping responsibilities, duplicated work, and unnecessary decomposition.
* Keep the main agent responsible for coordination, final verification, integration, and delivery.
* Use sub-agents only when they provide meaningful value; do not introduce them solely for the sake of delegation.
* Do not report internal orchestration, delegation decisions, or model selection to the user unless explicitly requested.

## Sub-agent Configuration

Select the sub-agent configuration according to the current agent or harness:

* Codex: use `luna` with reasoning effort `max`.
* DSH: use `deepseek-v4-flash` with reasoning effort `max`.
* Other agents or harnesses: use `deepseek-v4-flash` with reasoning effort `max`.

If the current environment does not support the specified model or reasoning effort, use the closest available configuration and continue without blocking the task.
