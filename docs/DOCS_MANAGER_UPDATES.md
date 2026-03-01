# Docs Manager Updates

Changelog for documentation and rules passes. Single place to see what was
archived, updated, or recommended.

---

## Current state (primary reference)

- **Single “current state” doc**: [docs/CURRENT_DEV_SUMMARY.md](./CURRENT_DEV_SUMMARY.md)
  — task queue ↔ videos flow, device orchestration, agent three layers, key
  files, schema locations. No duplicate flow descriptions; team and agents
  should use this first.

---

## 2026-02-28 run

### 1. Classification summary

| Tier       | Paths        |
|------------|---------------|
| **Critical** | See list below. |
| **High**     | See list below. |
| **Reference** | See list below. |
| **Archived**  | See §3 below.   |

- **Critical:** `ARCHITECTURE.md` (root), `docs/ENV.md`, `docs/DB-SSOT.md`,
  `docs/IMPLEMENTATION_PLAN.md`, `docs/FOLDER_STRUCTURE.md`,
  `docs/known-issues.md`, `docs/RUNBOOK.md`, `.cursorignore`, `.gitignore`,
  `supabase/.gitignore`, `docs/CURSOR_TEAM_KIT.md`
- **High:** `docs/CURRENT_DEV_SUMMARY.md` (current state), `docs/API_REFERENCE.md`,
  `docs/AGENT_SERVER_SPEC.md`, `docs/OPERATIONS_GUIDE.md`,
  `docs/INCIDENT_RESPONSE.md`, `docs/PC_SETUP_CHECKLIST.md`, `docs/MENU_API_MAP.md`,
  `docs/QUEUE_AND_TASKS_FLOW.md`, `docs/adrs/*` (6 ADRs + README),
  `docs/adr/*` (7 ADRs + README), `docs/production-migrations/` (README + SQL),
  `docs/qa-reports/README.md`
- **Reference:** `docs/plans/*` (4), `docs/IMPLEMENTATION_PLAN_V2.md`,
  `docs/xiaowei-api.md`, `docs/xiaowei_client.md`, `docs/youtube-deploy-flow.md`,
  `docs/youtube-ui-objects.md`, `docs/task-devices-engine-verification.md`,
  `docs/MINIMAL_MVP.md`, `docs/REMOTE_PC_EXECUTION.md`, `docs/SCRIPTS_NAMING.md`,
  `docs/DESIGN_SYSTEM.md`, `docs/FRONTEND_REVIEW.md`, `docs/DASHBOARD_BUILD_PLAN.md`,
  `docs/COST_ANALYSIS.md`, `docs/INTRANET_ACCESS_CONTROL.md`,
  `docs/qa-reports/2026-02-28-full-codebase-review.md`

- **Critical**: SSOT, env, DB, implementation plan, folder structure, known
  issues, runbook, ignore files, Cursor Team Kit usage.
- **High**: API/agent spec, operations/incident/PC setup, architecture summary,
  ADRs (both `adr/` and `adrs/`), production-migrations, qa-reports index.
- **Reference**: Plans, design docs, Xiaowei/YouTube references, one-off
  reviews/plans. Keep but not primary.
- **Archived**: One-off release prompts, migration runbooks superseded by
  production-migrations, guardrails folded into project-conventions,
  WSL/Windows cleanup checklist.

---

### 2. Rules summary

| Rule | Location | Verdict | Notes |
|------|----------|---------|--------|
| **project-core.mdc** | Root + rules/ | **Keep both** | Dup; prefer root. |
| **project-conventions.mdc** | Root + rules/ | **Keep root** | Merge to one. |
| **webapp.mdc** | Root | **Keep** | DB mapping + upsert (app/lib). |
| **rules/webapp.mdc** | rules/ | **Merge recommended** | Empty. Merge to root |
| **agent.mdc** | Root + rules/ | **Keep both** | Root+rules: dev, role, env. |
| **supabase.mdc** | Root | **Keep** | Project ref, MCP/CLI. |
| **supabase-schema.mdc** | Root + rules/ | **Keep one** | Dup; ref .mdc. |
| **sonarqube_mcp_instructions.mdc** | Root | **Keep** | MCP; alwaysApply. |
| **modules.mdc** | rules/ | **Keep** | lib/hooks; glob-specific. |
| **blocks.mdc** | rules/ | **Keep** | app layout, tabs, API routes. |
| **typescript-nextjs.mdc** | rules/ | **Keep** | App Router; update auth. |
| **components.mdc** | rules/ | **Keep** | UI/farm, shadcn. |
| **planner-workflow.mdc** | rules/ | **Keep** | Phase flow, UltraQA. |

**Duplicate pairs:** project-core, project-conventions, supabase-schema each exist
in Root and rules/. Same body or root fuller. Single source per rule; remove or
symlink rules/ duplicates to avoid drift.

**Invalid reference:** supabase.mdc references `docs/supabase-schema.md` (missing).
Add it from supabase-schema.mdc content or reference only the .mdc file.

---

### 3. Files archived (this run)

- `docs/RELEASE1-CURSOR-PROMPT.md` → `_archive/docs/RELEASE1-CURSOR-PROMPT.md`
- `docs/RELEASE1_MIGRATION.md` → `_archive/docs/RELEASE1_MIGRATION.md`
- `docs/REGRESSION-GUARDRAIL.md` → `_archive/docs/REGRESSION-GUARDRAIL.md`
- `docs/WSL-WINDOWS-CLEANUP-CHECKLIST.md` →
  `_archive/docs/WSL-WINDOWS-CLEANUP-CHECKLIST.md`
- `docs/architecture.md` → `_archive/docs/architecture.md`

**Reason:** First four — one-off release prompts and migration runbooks;
guardrail covered by project-conventions; WSL/Windows checklist optional.
**docs/architecture.md** — legacy YouTube flow; superseded by task_queue →
task_devices. Current flow: `docs/CURRENT_DEV_SUMMARY.md`,
`docs/architecture-five-layer-pipeline.md`.
No deletions; archive only.

---

### 4. Reference fixes (not applied; recommendations)

- **ARCHITECTURE.md:** Root `ARCHITECTURE.md` (v2.1) remains SSOT for
  high-level design. For current task/video/agent flow use
  `docs/CURRENT_DEV_SUMMARY.md`. `docs/architecture.md` → `_archive/docs/`.
- **ADR folders:** Two sets — `docs/adrs/` (ADR-001–006) and `docs/adr/`
  (ADR-001–007). Overlap; keep both. Consider one README index linking both.
- **docs/supabase-schema.md:** Missing. Create from supabase-schema.mdc or
  update supabase.mdc to reference only the .mdc file.

---

*Next run: Re-check rules after any merge; add a new dated section here.*
