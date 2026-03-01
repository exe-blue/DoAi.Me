# Docs Manager Updates

Changelog for documentation and rules passes. Single place to see what was archived, updated, or recommended.

---

## Current state (primary reference)

- **Single “current state” doc**: [docs/CURRENT_DEV_SUMMARY.md](./CURRENT_DEV_SUMMARY.md) — task queue ↔ videos flow, device orchestration, agent three layers, key files, schema locations. No duplicate flow descriptions; team and agents should use this first.

---

## 2026-02-28 run

### 1. Classification summary

| Tier | Paths |
|------|--------|
| **Critical** | `ARCHITECTURE.md` (root), `docs/ENV.md`, `docs/DB-SSOT.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/FOLDER_STRUCTURE.md`, `docs/known-issues.md`, `docs/RUNBOOK.md`, `.cursorignore`, `.gitignore`, `supabase/.gitignore`, `docs/CURSOR_TEAM_KIT.md` |
| **High** | `docs/CURRENT_DEV_SUMMARY.md` (current state), `docs/API_REFERENCE.md`, `docs/AGENT_SERVER_SPEC.md`, `docs/OPERATIONS_GUIDE.md`, `docs/INCIDENT_RESPONSE.md`, `docs/PC_SETUP_CHECKLIST.md`, `docs/MENU_API_MAP.md`, `docs/QUEUE_AND_TASKS_FLOW.md`, `docs/ARCHIVE_POLICY.md`, `docs/adrs/*` (6 ADRs + README), `docs/adr/*` (7 ADRs + README), `docs/production-migrations/` (README + SQL), `docs/qa-reports/README.md` |
| **Reference** | `docs/plans/*` (4), `docs/IMPLEMENTATION_PLAN_V2.md`, `docs/xiaowei-api.md`, `docs/xiaowei_client.md`, `docs/youtube-deploy-flow.md`, `docs/youtube-ui-objects.md`, `docs/task-devices-engine-verification.md`, `docs/MINIMAL_MVP.md`, `docs/REMOTE_PC_EXECUTION.md`, `docs/SCRIPTS_NAMING.md`, `docs/DESIGN_SYSTEM.md`, `docs/FRONTEND_REVIEW.md`, `docs/DASHBOARD_BUILD_PLAN.md`, `docs/COST_ANALYSIS.md`, `docs/INTRANET_ACCESS_CONTROL.md`, `docs/qa-reports/2026-02-28-full-codebase-review.md` |
| **Archived** | See §3 below. |

- **Critical**: SSOT, env, DB, implementation plan, folder structure, known issues, runbook, ignore files, Cursor Team Kit usage.
- **High**: API/agent spec, operations/incident/PC setup, architecture summary, ADRs (both `adr/` and `adrs/`), production-migrations, qa-reports index.
- **Reference**: Plans, design docs, Xiaowei/YouTube references, one-off reviews/plans. Keep but not primary.
- **Archived**: One-off release prompts, migration runbooks superseded by production-migrations, guardrails folded into project-conventions, WSL/Windows cleanup checklist.

---

### 2. Rules summary

| Rule | Location | Verdict | Notes |
| **Archive policy** | [docs/ARCHIVE_POLICY.md](./ARCHIVE_POLICY.md) | **Apply** | Unused/superseded docs → `_archive/`; list in this file. Do **not** use archived docs for current development unless explicitly needed (e.g. regression or version compare). Use only Critical/High/Reference docs. |
|------|----------|---------|--------|
| **project-core.mdc** | Root + rules/ | **Keep both** | Duplicate content. Root is alwaysApply. Prefer single source: keep root, consider making rules/ a symlink or removing rules/project-core.mdc to avoid drift. |
| **project-conventions.mdc** | Root + rules/ | **Keep root** | Root has PR/Dev Container/EOL details. rules/ is shorter. Merge recommended into one; until then keep root as primary. |
| **webapp.mdc** | Root | **Keep** | DB column mapping + upsert; applies to app/lib. |
| **rules/webapp.mdc** | rules/ | **Merge recommended** | Empty (26 bytes). Remove or merge into root webapp.mdc. |
| **agent.mdc** | Root + rules/ | **Keep both** | Root: dev rules, S9 coords, Xiaowei. rules/: role, env, files. Complementary; consider merging into one agent rule. |
| **supabase.mdc** | Root | **Keep** | Project ref, link, MCP/CLI usage. |
| **supabase-schema.mdc** | Root + rules/ | **Keep one** | Duplicate schema summary. Keep root or rules/ (same content). Supabase.mdc references `docs/supabase-schema.md` — **file does not exist**; point to this rule or add docs/supabase-schema.md. |
| **sonarqube_mcp_instructions.mdc** | Root | **Keep** | MCP tool usage; alwaysApply. |
| **modules.mdc** | rules/ | **Keep** | lib/hooks structure; glob-specific. |
| **blocks.mdc** | rules/ | **Keep** | app layout, tabs, API route structure. |
| **typescript-nextjs.mdc** | rules/ | **Keep** | App Router, API route pattern. Uses deprecated `createRouteHandlerClient` — update to current Supabase auth helpers when touching. |
| **components.mdc** | rules/ | **Keep** | UI/farm components, shadcn. |
| **planner-workflow.mdc** | rules/ | **Keep** | IMPLEMENTATION_PLAN Phase flow, UltraQA. |

**Duplicate pairs**: `.cursor/rules/project-core.mdc` ≈ `.cursor/rules/rules/project-core.mdc` (same body). `.cursor/rules/project-conventions.mdc` vs `rules/project-conventions.mdc` (root fuller). `.cursor/rules/supabase-schema.mdc` ≈ `rules/supabase-schema.mdc`. **Recommendation**: Single source per rule; remove or symlink the rules/ duplicates to avoid drift.

**Invalid reference**: `supabase.mdc` says "스키마·컬럼명은 `.cursor/rules/supabase-schema.mdc` 및 `docs/supabase-schema.md` 와 일치". `docs/supabase-schema.md` is missing — add it (from supabase-schema.mdc content) or change the rule to reference only the .mdc file.

---

### 3. Files archived (this run)

| Original path | Destination |
|---------------|-------------|
| `docs/RELEASE1-CURSOR-PROMPT.md` | `_archive/docs/RELEASE1-CURSOR-PROMPT.md` |
| `docs/RELEASE1_MIGRATION.md` | `_archive/docs/RELEASE1_MIGRATION.md` |
| `docs/REGRESSION-GUARDRAIL.md` | `_archive/docs/REGRESSION-GUARDRAIL.md` |
| `docs/WSL-WINDOWS-CLEANUP-CHECKLIST.md` | `_archive/docs/WSL-WINDOWS-CLEANUP-CHECKLIST.md` |
| `docs/architecture.md` | `_archive/docs/architecture.md` |

**Reason**: First four — one-off release prompts and migration runbooks; regression guardrail content is covered by project-conventions; WSL/Windows checklist is optional reference. **docs/architecture.md** — described legacy YouTube flow (VideoDispatcher, jobs/job_assignments); superseded by task_queue → tasks → task_devices flow. Current flow and agent layers are in `docs/CURRENT_DEV_SUMMARY.md` and `docs/architecture-five-layer-pipeline.md`. No deletions; archive only.

---

### 4. Reference fixes (not applied; recommendations)

- **ARCHITECTURE.md**: Rules and some docs point to `ARCHITECTURE.md` as SSOT. Root `ARCHITECTURE.md` (v2.1 full) remains SSOT for high-level system design. For **current task/video/agent flow** use `docs/CURRENT_DEV_SUMMARY.md`. `docs/architecture.md` archived → `_archive/docs/architecture.md`.
- **ADR folders**: Two ADR sets exist — `docs/adrs/` (ADR-001–006, v2.1 serverless, channel-video, realtime, agent, task queue, auth) and `docs/adr/` (ADR-001–007, foundation, device discovery, YouTube watch, realtime monitoring, channel content, auth, task queue dispatcher). Overlap in themes; keep both as reference. Consider an index in one README linking both.
- **docs/supabase-schema.md**: Missing. Either create from `.cursor/rules/supabase-schema.mdc` or update `supabase.mdc` to reference only the rule file.

---

## 2026-03-01 run

### 1. Verification (2026-02-26–28 changes)

- **CURRENT_DEV_SUMMARY.md**: Already reflected task_devices SSOT, agent three layers, queue → tasks → task_devices. Added Source-of-truth rows for Auth (Supabase Auth, ENV.md, ADRs), PC agent deploy/rollback (Node scripts), and production-migrations.
- **ENV.md**: Already documents Supabase Auth (login/signup, callback URLs). No change.
- **DB-SSOT.md**, **production-migrations/README.md**: Already aligned with task_devices/scripts/workflows_definitions. No change.
- **RUNBOOK.md**, **PC_SETUP_CHECKLIST.md**: Updated deploy/rollback from `.ps1` to cross-platform Node: `npm run deploy`, `npm run rollback -- <version>` (scripts: `scripts/deploy.mjs`, `scripts/rollback.mjs`).
- **Auth migration, task_devices handoff, deploy pipeline**: ADRs already exist (ADR-006 Auth0→Supabase in both `adr/` and `adrs/`; task queue/task_devices in ADRs and DB-SSOT). No new ADRs added.

### 2. Archive policy and rule

- **Policy**: [docs/ARCHIVE_POLICY.md](./ARCHIVE_POLICY.md) — unused or superseded docs → `_archive/`; list moves in this file under “Files archived”.
- **Rule**: Do not open or use archived docs for current development unless explicitly needed (e.g. debugging regression or comparing versions). Use only current/active docs (Critical/High/Reference tiers above). Rule also added to Rules summary (§2) and referenced in AGENTS.md and CLAUDE.md.

### 3. Files added

| Path | Purpose |
|------|---------|
| `docs/ARCHIVE_POLICY.md` | Archive policy + “do not use archive for current dev” rule. |

### 4. Recommendations

- None. Auth, task_devices, and deploy are covered by existing ADRs and updated Critical/High docs.

---

*Next run: Re-check rules after any merge; update this file with a new dated section.*
