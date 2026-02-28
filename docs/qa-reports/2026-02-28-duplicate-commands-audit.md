# Duplicate / Redundant Commands & Imports Audit

**Date:** 2026-02-28  
**Scope:** `.cursor/`, `agent/`, `app/`, `lib/`, `components/`, `scripts/`, `tests/` (excluded: `node_modules`, `.next`)

---

## 1. StrReplace / search_replace usage

**Finding:** No duplicate or redundant string-replace / edit patterns were found that could cause double-apply bugs.

- **Search:** `StrReplace`, `search_replace`, `replace_all`, `old_string`, `new_string` across rules, skills, scripts, and app code.
- **Result:** No Cursor/agent edit helpers or duplicate replacement blocks in scope. The only matches were prose in `.cursor/rules/sonarqube_mcp_instructions.mdc` (“replace”) and `.cursor/agents/shadcn-theme-auditor.md` (“replacement”).

| Category        | Count |
|----------------|-------|
| Duplicate edits| 0     |
| Double-apply   | 0     |

---

## 2. Duplicate / redundant imports

**Finding:** No duplicate **import** statements (same path imported twice in one file) were found in TypeScript/TSX files under `app/`, `lib/`, `components/`, or `hooks/`. Each file uses at most one import per path (sometimes one line for server, one for types — different paths).

**Duplicate or redundant `require()` in the same file (agent JS):**

| File | Description | Severity | Status |
|------|-------------|----------|--------|
| `agent/youtube/verify.js` | `require('../adb/screen')` at top (only `dumpUI`) and again inside `verifyPlaying()` for `getPlaybackState`. | **Medium** | **Fixed** — added `getPlaybackState` to top-level require and removed inline require. |
| `agent/orchestrator/heartbeat.js` | `require('../device/models')` at lines 85, 118, 206 (once for `pcModels`, twice for `deviceModels`). | **Medium** | **Fixed** — single top-level `const { pcModels, deviceModels } = require('../device/models')`, removed three inline requires. |
| `agent/youtube/flows.js` | `require('fs')` and `require('path')` inside `_saveScreenshot()` instead of at top. | **Low** | **Fixed** — added `fs` and `path` at top of file, removed from inside `_saveScreenshot()`. |

**Intentional multiple `require`/config (no change):**

- **Tests/scripts loading two env files:** `tests/seed-channels.js`, `tests/seed-e2e-mvp.js`, `tests/e2e-local.js`, `tests/e2e-youtube-watch.js`, `scripts/smoke-test.js` call `dotenv.config()` twice with different paths (e.g. `agent/.env` and `.env.local`). This is intentional to merge two env files; not a bug.

---

## 3. Duplicate file / module invocation

**Finding:** Same module required more than once in a single file — see table above. No repeated `readFile` of the same path in one flow was found.

| Category              | Count | Notes |
|-----------------------|-------|--------|
| Duplicate require same module in one file | 3 (all fixed) | verify.js (screen), heartbeat.js (device/models), flows.js (fs, path) |
| Same file path read/executed twice in one flow | 0 | — |

---

## 4. Fixes applied

1. **`agent/youtube/verify.js`**
   - Top-level: `const { dumpUI, getPlaybackState } = require('../adb/screen');`
   - Removed inline `const { getPlaybackState } = require('../adb/screen');` from `verifyPlaying()`.

2. **`agent/orchestrator/heartbeat.js`**
   - Top-level: `const { pcModels, deviceModels } = require('../device/models');`
   - Removed inline `require('../device/models')` from `_heartbeatTick()`, `checkAllDevices()`, and `getDeviceHealth()`.

3. **`agent/youtube/flows.js`**
   - Top-level: `const fs = require('fs'); const path = require('path');`
   - Removed inline `const fs = require('fs'); const path = require('path');` from `_saveScreenshot()`.

---

## 5. Summary

| Section                    | Issues found | Fixed |
|---------------------------|-------------|-------|
| StrReplace / editing dups | 0           | —     |
| Duplicate imports (TS/TSX)| 0           | —     |
| Duplicate/redundant require (agent JS) | 3 | 3     |
| Duplicate file read/exec   | 0           | —     |

**Report path:** `docs/qa-reports/2026-02-28-duplicate-commands-audit.md`

No double-apply or duplicate-import bugs were found in the codebase. Three redundant `require()` patterns in agent JS were consolidated to top-level requires to avoid repeated module resolution and keep style consistent.
