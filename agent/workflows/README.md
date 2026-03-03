# Workflows

Optional thin runners for workflow sequencing. See **agent/docs/WORKFLOW_MODULES.md** for module→file mapping and execution model.

- **bootstrap.js** — `runBootstrapSteps(config, steps)`: runs an array of async step functions in order with module delay between each. Use from `agent.js` to sequence WF1 steps without inlining (e.g. pass `[phase1, phase2a, phase2b, ...]`).

No other workflow runners (WF3/WF4) are needed; execution remains claim + `runTaskDevice` in device-orchestrator and task-executor.
