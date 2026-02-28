# Four-issues fix report — 2026-02-28

**Scope:** Issue 1 (agent/.env.example), Issue 2 (agent/MODULES.md), Issue 3 (docs/plans addendum), Issue 4 (docs/qa-reports typo).

---

## Issue 1 — agent/.env.example (lines 5–6)

| Item | Result |
|------|--------|
| **Finding confirmed?** | Yes. Comment stated format `^PC[0-9]{2}$` (e.g. PC01, no hyphen) but example was `PC_NUMBER=PC-01`. |
| **Change made** | **agent/.env.example**: Set `PC_NUMBER=PC01` so the example matches the comment regex. No change to the regex. |
| **No change / reason** | — |

---

## Issue 2 — agent/MODULES.md (lines 99–102, duplicate `tasks` row)

| Item | Result |
|------|--------|
| **Finding confirmed?** | Yes. The DB Schema Access Map had two identical rows for `tasks` (lines 92 and 96). |
| **Change made** | **agent/MODULES.md**: Removed the duplicate `tasks` row and kept a single row. Merged consumers: `task-executor`, `stale-task-cleaner`, `queue-dispatcher`, `supabase-sync`. Added `schedule-evaluator` (queries `tasks` in overlap detection). Final single entry: `tasks` \| `task-executor`, `stale-task-cleaner`, `queue-dispatcher`, `supabase-sync`, `schedule-evaluator`. |
| **No change / reason** | — |

---

## Issue 3 — docs/plans/agent-env-device-sync-task-devices-ssot-addendum.md (line 36, dual-path)

| Item | Result |
|------|--------|
| **Finding confirmed?** | Yes. The document left (a) vs (b) undecided. |
| **Change made** | **docs/plans/agent-env-device-sync-task-devices-ssot-addendum.md**: Documented chosen approach: **(a)**. Added a short paragraph: “선택한 접근 방식: (a)” and rationale. Verification: `agent.js` does not call `subscribeToBroadcast`, `subscribeToTasks`, or `getPendingTasks` → `taskExecutor.execute(task)`; task execution is only via DeviceOrchestrator (task_devices claim → `runTaskDevice`). Rationale: codebase already implements (a); single path reduces complexity and preserves task_devices SSOT. |
| **No change / reason** | — |

---

## Issue 4 — docs/qa-reports/2026-02-28-plan-implementation-summary.md (line 19, typo)

| Item | Result |
|------|--------|
| **Finding confirmed?** | Yes. Text said “2비트” (2 bits) where heartbeat cycles were intended. |
| **Change made** | **docs/qa-reports/2026-02-28-plan-implementation-summary.md**: Replaced “2비트” with “2회” so it clearly refers to two heartbeat cycles. Rest of sentence (ERROR_THRESHOLD = 2, prevSerials, errorCountMap, errorSerials, markOfflineDevices, room:devices broadcast) unchanged. |
| **No change / reason** | — |

---

## Summary

| Issue | File(s) | Outcome |
|-------|---------|--------|
| 1 | agent/.env.example | `PC_NUMBER=PC01` to match regex. |
| 2 | agent/MODULES.md | One `tasks` row with merged consumers + schedule-evaluator. |
| 3 | docs/plans/agent-env-device-sync-task-devices-ssot-addendum.md | Approach (a) chosen and documented with rationale. |
| 4 | docs/qa-reports/2026-02-28-plan-implementation-summary.md | “2비트” → “2회”. |

All four findings were confirmed and fixed.
