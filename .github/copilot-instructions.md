# Copilot Coding Agent Instructions for DoAi.Me

> **Last Updated**: 2026-02-27  
> **Repository**: exe-blue/DoAi.Me  
> **Version**: 2.1.0

This document provides essential information for AI coding agents working on the DoAi.Me repository. Read this carefully before making any changes.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Technology Stack](#technology-stack)
4. [Development Setup](#development-setup)
5. [Building, Testing, and Linting](#building-testing-and-linting)
6. [Common Pitfalls and Important Caveats](#common-pitfalls-and-important-caveats)
7. [Code Patterns and Best Practices](#code-patterns-and-best-practices)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Key Files and Locations](#key-files-and-locations)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

DoAi.Me is a YouTube automated view-farming system that manages **500 Galaxy S9 devices** across **5 Node PCs** with a serverless backend. It consists of two main components:

| Component | Location | Purpose | Platform |
|-----------|----------|---------|----------|
| **Next.js Web Dashboard** | Root `/` | Real-time operator dashboard on port 3000 | Vercel (Serverless) |
| **Node.js Agent** | `agent/` | Device controller for Windows PCs with phones | Windows-only |

### Core Architecture

- **Backend**: Serverless (Vercel API Routes + Supabase PostgreSQL)
- **Realtime**: Supabase Broadcast (WebSocket) for instant dashboard updates
- **Device Control**: Xiaowei WebSocket API (`ws://127.0.0.1:22222/`) + ADB
- **Task Execution**: Preset-based actions (Xiaowei Actions) + AutoJS scripts + ADB commands
- **Logging**: Database-centric (all agent commands logged to `task_logs` table)

### Key Features

- 19 API routes for workers, devices, tasks, accounts, presets, channels, schedules, stats, logs
- 6 Zustand stores for state management
- Real-time device monitoring via Supabase Broadcast
- Preset management for recorded gestures and scripts
- Multi-PC agent coordination
- Automated cleanup via pg_cron scheduled jobs

**IMPORTANT**: Read `ARCHITECTURE.md` for detailed system design before making architectural changes.

---

## Repository Structure

```
doai.me/
├── app/                          # Next.js 15 App Router
│   ├── api/                      # API Routes (19 endpoints)
│   │   ├── workers/              # Worker CRUD + heartbeat
│   │   ├── devices/              # Device management
│   │   ├── tasks/                # Task CRUD + execution
│   │   ├── accounts/             # Account pool
│   │   ├── presets/              # Command presets
│   │   ├── channels/             # YouTube channel management
│   │   ├── youtube/              # YouTube API integration
│   │   ├── proxies/              # Proxy management
│   │   ├── schedules/            # Task scheduling
│   │   ├── stats/                # Statistics
│   │   ├── logs/                 # Log retrieval
│   │   └── health/               # Health checks
│   ├── dashboard/                # Dashboard pages (8 routes)
│   │   ├── infrastructure/       # PCs, devices, proxies
│   │   ├── content/              # Channels, tasks
│   │   ├── automation/           # Scripts, workflows, ADB
│   │   └── system/               # Settings, logs, errors
│   ├── page.tsx                  # Main dashboard entry
│   └── layout.tsx                # Root layout
├── components/
│   ├── ui/                       # shadcn/ui + Radix UI components
│   └── dashboard/                # Dashboard-specific components
├── hooks/                        # React hooks + Zustand stores
│   ├── use-workers-store.ts
│   ├── use-tasks-store.ts
│   ├── use-logs-store.ts
│   ├── use-stats-store.ts
│   ├── use-presets-store.ts
│   ├── use-proxies-store.ts
│   └── use-realtime.ts           # Supabase Broadcast subscriptions
├── lib/
│   ├── supabase/                 # Supabase clients + types
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server-side client
│   │   └── middleware.ts         # Auth middleware client
│   ├── db/                       # Database query builders
│   ├── types.ts                  # Frontend TypeScript types
│   └── schemas.ts                # Zod validation schemas
├── agent/                        # Node PC Agent (Windows-only)
│   ├── agent.js                  # Main agent (CommonJS, production)
│   ├── xiaowei-client.js         # Xiaowei WebSocket client
│   ├── supabase-sync.js          # Supabase polling + sync
│   ├── task-executor.js          # Task execution logic
│   ├── common/                   # Shared utilities
│   ├── package.json              # Separate dependencies
│   └── .env.example              # Agent environment template
├── tests/                        # Test suites
│   ├── *.test.ts                 # Vitest unit tests (24 tests)
│   ├── e2e-local.js              # E2E pipeline test
│   ├── seed-channels.js          # Test data seeding
│   └── run-api-tests.js          # API route tests
├── supabase/
│   ├── migrations/               # Database migrations
│   └── verify_schema.sql         # Schema validation
├── packages/                     # npm workspaces (empty stubs)
│   ├── shared/                   # @doai/shared (future)
│   └── supabase/                 # @doai/supabase (future)
├── scripts/                      # Build and deployment scripts
├── .github/
│   └── workflows/
│       ├── ci-cd.yml             # Main CI/CD pipeline
│       └── policy-guard.yml      # Security policies
├── ARCHITECTURE.md               # **READ THIS FIRST** - System design
├── AGENTS.md                     # Cursor Cloud-specific instructions
├── README.md                     # User documentation
├── package.json                  # Root dependencies + scripts
└── middleware.ts                 # Next.js middleware (auth)
```

### Important Notes

- **Agent directory**: Has its own `package.json` and dependencies. Run `npm install` in both root and `agent/` directories.
- **Workspaces**: `packages/*` are defined in root `package.json` but currently empty stubs.
- **Legacy code**: `app_legacy/` is archived and excluded from TypeScript compilation.
- **TypeScript**: Root uses TypeScript; agent uses CommonJS JavaScript (no build step needed).

---

## Technology Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| **Frontend** | Next.js | 15.5.12 | App Router, Server Components |
| | React | 18.3.1 | With Suspense and Error Boundaries |
| | TypeScript | 5.6.3 | Strict mode enabled |
| **UI Libraries** | shadcn/ui | Latest | Radix UI primitives |
| | Tailwind CSS | 3.4.15 | With animations |
| | Magic UI | Latest | Enhanced components |
| | Framer Motion | 12.34.0 | Animations |
| **State Management** | Zustand | 5.0.2 | Global stores |
| | SWR | 2.4.0 | Data fetching |
| | React Hook Form | 7.71.1 | Form handling |
| | Zod | 3.24.1 | Schema validation |
| **Backend** | Supabase | 2.47.10 | PostgreSQL + Realtime |
| | Supabase SSR | 0.8.0 | Server-side auth |
| **Testing** | Vitest | 4.0.18 | Unit tests |
| | Testing Library | 16.3.2 | React component tests |
| | jsdom | 28.0.0 | DOM simulation |
| **Linting** | ESLint | 9.17.0 | Flat config |
| | eslint-config-next | 15.5.12 | Next.js rules |
| **Agent** | Node.js | 22.x | Windows runtime |
| | winston | 3.17.0 | Logging |
| | ws | 8.18.0 | WebSocket client |
| | dotenv | 16.4.5 | Environment variables |
| **DevOps** | Docker | Latest | Multi-stage builds |
| | Sentry | 10.38.0 | Error tracking |
| | Vercel Analytics | 1.6.1 | Performance monitoring |

### Critical Version Requirements

- **Node.js**: Version **22.x** is required (NOT 20.x) - enforced by devcontainer
- **npm**: 10.9.x or higher
- **Dev Container**: Mandatory for development/build/test (see below)

---

## Development Setup

### Prerequisites

1. **Dev Container** (MANDATORY for macOS/Linux):
   - Docker Desktop installed
   - VS Code or Cursor with Dev Containers extension
   - Open repo → "Reopen in Container"

2. **Environment Variables**:
   - Copy `.env.example` to `.env.local` (dashboard)
   - Copy `agent/.env.example` to `agent/.env` (agent only)

3. **External Services**:
   - Supabase project (Pro Plan for Realtime)
   - YouTube Data API key (optional for channel sync)
   - Xiaowei running on `ws://127.0.0.1:22222/` (agent only, Windows)

### Quick Start - Dashboard

```bash
# 1. Copy environment template
cp .env.example .env.local

# 2. Edit .env.local with your credentials:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - YOUTUBE_API_KEY (optional)

# 3. Install dependencies
npm ci

# 4. Run development server
npm run dev

# 5. Open browser
# http://localhost:3000
```

### Quick Start - Agent (Windows Only)

```bash
# 1. Navigate to agent directory
cd agent

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with PC-specific settings:
# - PC_NUMBER (1-5)
# - WORKER_NAME (unique identifier)
# - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# - XIAOWEI_WS_URL (default: ws://127.0.0.1:22222/)
# - LOG_LEVEL (debug, info, warn, error)

# 4. Install dependencies
npm ci

# 5. Run agent (production)
node agent.js

# OR for development
npm run dev
```

### Database Setup

```bash
# Link to Supabase project (one-time)
npm run db:link

# Push migrations
npm run db:push

# Verify schema
npm run db:verify
```

---

## Building, Testing, and Linting

### Available Commands

| Command | Purpose | Notes |
|---------|---------|-------|
| `npm run dev` | Start Next.js dev server | Port 3000 |
| `npm run build` | Production build | Pre-deployment check |
| `npm start` | Start production server | After `npm run build` |
| `npm run lint` | Run ESLint | Check code quality |
| `npm run test` | Run Vitest unit tests | 24 tests, requires deps |
| `npm run test:watch` | Watch mode for tests | Interactive |
| `npm run test:e2e` | E2E pipeline test | Requires agent + Xiaowei |
| `npm run test:api` | API route tests | Standalone |
| `npm run agent:dev` | Agent development mode | `cd agent && npm run dev` |
| `npm run agent:start` | Agent production mode | `cd agent && node agent.js` |
| `npm run db:push` | Apply Supabase migrations | One-time setup |
| `npm run db:verify` | Validate database schema | Health check |
| `npm run clean` | Remove `.next/` folder | Clear build cache |
| `npm run clean:cache` | Clear Next.js cache | Troubleshooting |

### Running Tests

#### Unit Tests (Vitest)

```bash
# Install dependencies first (both root and agent/)
npm ci
cd agent && npm ci && cd ..

# Run all tests
export SKIP_DEVCONTAINER_GUARD=1  # If not in devcontainer
npm run test

# Watch mode
npm run test:watch

# Expected: 24 passing tests in ~430ms
```

**Known Test Issue**: One test may fail with `Cannot find module 'winston'` - this is expected if agent dependencies aren't installed. Run `cd agent && npm ci` to fix.

#### E2E Tests

```bash
# Prerequisites:
# 1. Agent running: cd agent && node agent.js
# 2. Xiaowei running on ws://127.0.0.1:22222/
# 3. DB has channel/video data

# Seed test data (once)
node tests/seed-channels.js

# Run E2E test
npm run test:e2e

# Debug mode (no cleanup)
node tests/e2e-local.js --no-cleanup
```

### Linting

```bash
# Check for linting errors
npm run lint

# Auto-fix (if ESLint supports)
npm run lint -- --fix
```

**Configuration**: Uses Next.js ESLint flat config (`eslint.config.mjs`).

### Building

```bash
# Production build
npm run build

# Expected output:
# - .next/ directory with optimized bundles
# - Static pages pre-rendered
# - API routes validated

# Test build locally
npm start
```

---

## Common Pitfalls and Important Caveats

### Dev Container Requirement

**CRITICAL**: Development, builds, and tests **MUST** run in a Dev Container on macOS/Linux.

- **Why**: Prevents WSL/Windows/Container mixing causing huge diffs, EOL issues, and inconsistent builds
- **Guard Script**: `scripts/guard-devcontainer.mjs` blocks native npm on macOS/Linux
- **Override**: Set `SKIP_DEVCONTAINER_GUARD=1` or `DOAI_ALLOW_NATIVE_NPM=1` for CI/remote PCs
- **Windows Exception**: Native Windows paths (e.g., `C:\...`) bypass guard for agent deployment

### Environment Configuration

| Issue | Solution |
|-------|----------|
| **Missing `.env.local`** | Copy from `.env.example`. Without valid Supabase credentials, UI renders but data fetches fail. |
| **Invalid Supabase URL** | Middleware gracefully skips auth checks when URL is placeholder. Check logs. |
| **Agent `.env` confusion** | Agent uses `agent/.env.example`, NOT root `.env.example`. |
| **Three `.env` templates** | `.env.example` (dashboard), `.env.prod.example`, `.env.staging.example`. Use correct one. |
| **YouTube API quota** | Shared API key - monitor quota in Google Cloud Console. |

### Agent-Specific Issues

| Issue | Solution |
|-------|----------|
| **Xiaowei not running** | Agent won't start. Must run Xiaowei first on Windows PC at `ws://127.0.0.1:22222/`. |
| **Windows-only agent** | Agent ONLY runs on Windows. Uses PowerShell, ADB tools, Xiaowei WebSocket. |
| **Physical hardware** | Requires actual Galaxy S9 devices + USB hubs. Xiaowei VIP license for advanced features. |
| **Separate dependencies** | Agent has own `package.json`. Run `npm ci` in both root and `agent/` directories. |
| **No TypeScript build** | Agent uses CommonJS `.js` files directly. No compilation step needed. |

### Database and Realtime

| Issue | Solution |
|-------|----------|
| **Stale tasks stuck in "running"** | pg_cron job resets after 1 hour. Check `reset-stuck-tasks` schedule in DB. |
| **Devices going offline** | 7-day auto-cleanup via `cleanup-stale-devices` cron. Last heartbeat tracked. |
| **Broadcast not working** | Needs `pg_net` enabled + Vault with credentials. Check database triggers. |
| **Task logs exploding** | Auto-cleanup after 30 days via `cleanup-old-task-logs` cron. |
| **Supabase not local** | Uses production Supabase cloud (Pro Plan required). NOT local Supabase. |

### Build and CI Issues

| Issue | Solution |
|-------|----------|
| **TypeScript errors in build** | `next.config.js` has `ignoreBuildErrors: true` for containerization. Fix issues anyway. |
| **Sentry source maps** | Requires `.env.sentry` with `SENTRY_AUTH_TOKEN`. Optional - CI skips if missing. |
| **npm install vs npm ci** | Always use `npm ci` in CI for lockfile consistency. |
| **Security overrides** | `package.json` has dependency overrides for vulnerabilities (tar, glob, etc.). |

### Testing Issues

| Issue | Solution |
|-------|----------|
| **Vitest tests fail** | Install deps in both root and `agent/` directories. |
| **Mock Supabase** | Vitest tests mock all DB calls. Don't require real Supabase. |
| **E2E requires Xiaowei** | E2E tests need agent + Xiaowei running. Use seed script first. |

---

## Code Patterns and Best Practices

### File Organization

- **API Routes**: Use `app/api/[resource]/route.ts` pattern
- **Server Components**: Default in App Router
- **Client Components**: Use `"use client"` directive sparingly
- **Shared Logic**: Put in `lib/` or `hooks/`
- **Types**: Frontend types in `lib/types.ts`, Supabase types auto-generated

### Supabase Patterns

```typescript
// Server-side (API routes, Server Components)
import { createClient } from "@/lib/supabase/server";
const supabase = createClient();

// Client-side (Client Components)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

// Middleware
import { createClient } from "@/lib/supabase/middleware";
const supabase = createClient(request);
```

### Realtime Subscriptions

```typescript
// Pattern: hooks/use-realtime.ts
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeChannel(channel: string, callback: (payload: any) => void) {
  useEffect(() => {
    const supabase = createClient();
    const subscription = supabase
      .channel(channel)
      .on('broadcast', { event: '*' }, callback)
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [channel, callback]);
}
```

### Broadcast Events

Send realtime updates from agent or API routes:

```javascript
// Agent: agent/broadcaster.js
async function publishBroadcast(channel, event, payload) {
  await supabase.channel(channel).send({
    type: 'broadcast',
    event,
    payload
  });
}
```

### Error Handling

- Use Sentry for production errors
- Log to `task_logs` table for agent operations
- Return proper HTTP status codes from API routes
- Use Error Boundaries in React components

### Zustand Stores

```typescript
// Pattern: hooks/use-[resource]-store.ts
import { create } from 'zustand';

interface ResourceStore {
  items: Resource[];
  setItems: (items: Resource[]) => void;
  addItem: (item: Resource) => void;
  // ...
}

export const useResourceStore = create<ResourceStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
}));
```

### Form Handling

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  // ...
});

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '' }
  });
  // ...
}
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

File: `.github/workflows/ci-cd.yml`

**Stages**:

1. **Lint**: ESLint + TypeScript type check + Dockerfile lint
2. **Test**: Vitest unit tests + npm audit
3. **Build Image**: Docker build + test image + push to GHCR
4. **Security Scan**: Trivy + Docker Scout
5. **Deploy Staging**: On `develop` branch push
6. **Deploy Production**: On `main` branch push

### Environment Variables (GitHub Secrets)

**Required for Deployment**:

- `STAGING_DEPLOY_KEY`, `STAGING_DEPLOY_HOST`, `STAGING_DEPLOY_USER`, `STAGING_URL`
- `PROD_DEPLOY_KEY`, `PROD_DEPLOY_HOST`, `PROD_DEPLOY_USER`, `PROD_URL`

**Optional**:

- `SENTRY_AUTH_TOKEN` (source maps)

### Triggers

- **Push**: `main`, `develop` branches
- **Pull Request**: `main`, `develop` branches

### Debugging CI Failures

1. Check workflow run logs in GitHub Actions
2. Reproduce locally:
   ```bash
   # Lint
   npm run lint
   npx tsc --noEmit
   
   # Test
   npm run test
   
   # Build
   docker build -t test-image .
   docker run --rm test-image npm run build --dry-run
   ```

3. Common failures:
   - **Lint errors**: Fix with `npm run lint -- --fix`
   - **Type errors**: Run `npx tsc --noEmit` locally
   - **Test failures**: Check agent dependencies
   - **Docker build**: Check Dockerfile syntax

---

## Key Files and Locations

### Must-Read Documentation

| File | Purpose | When to Read |
|------|---------|--------------|
| `ARCHITECTURE.md` | System design, component interactions | Before architectural changes |
| `AGENTS.md` | Cursor Cloud-specific instructions | When using Cursor Cloud |
| `README.md` | User-facing documentation | For feature overview |
| `DEPLOYMENT.md` | Deployment procedures | Before deploying |
| `GITHUB_SECRETS_SETUP.md` | CI/CD secret configuration | Setting up CI/CD |

### Critical Configuration Files

| File | Purpose | Notes |
|------|---------|-------|
| `package.json` | Root dependencies, scripts, workspaces | Main config |
| `next.config.js` | Next.js configuration, Sentry setup | Has `ignoreBuildErrors: true` |
| `middleware.ts` | Next.js middleware, auth routing | Redirects to `/login` |
| `tsconfig.json` | TypeScript configuration | Excludes `agent/` |
| `vitest.config.ts` | Test configuration | Node environment |
| `eslint.config.mjs` | Linting rules | Flat config |
| `tailwind.config.ts` | Tailwind CSS | Theme customization |
| `.env.example` | Dashboard environment template | Copy to `.env.local` |
| `agent/.env.example` | Agent environment template | Copy to `agent/.env` |
| `agent/package.json` | Agent dependencies | Separate from root |

### Database Files

| File | Purpose |
|------|---------|
| `supabase/migrations/*.sql` | Database schema migrations |
| `supabase/verify_schema.sql` | Schema validation queries |
| `lib/supabase/server.ts` | Server-side DB client factory |
| `lib/supabase/client.ts` | Browser DB client factory |
| `lib/db/*.ts` | Query builders (channels, tasks, etc.) |

### Agent Files

| File | Purpose |
|------|---------|
| `agent/agent.js` | Main orchestrator (production) |
| `agent/xiaowei-client.js` | Xiaowei WebSocket API client |
| `agent/supabase-sync.js` | DB polling and sync |
| `agent/task-executor.js` | Task execution logic |
| `agent/common/logger.js` | Winston logger |
| `agent/common/config.js` | Configuration management |

### Dashboard Pages

| Route | Purpose |
|-------|---------|
| `app/page.tsx` | Main dashboard landing |
| `app/dashboard/infrastructure/*` | PCs, devices, proxies, network |
| `app/dashboard/content/*` | Channels, tasks, completed tasks |
| `app/dashboard/automation/*` | Scripts, workflows, ADB commands |
| `app/dashboard/system/*` | Settings, logs, errors |

### API Routes

Key endpoints in `app/api/`:

- `workers/` - Worker CRUD, heartbeat
- `devices/` - Device management
- `tasks/` - Task CRUD, execution
- `channels/` - Channel management
- `youtube/` - YouTube API integration
- `proxies/` - Proxy management
- `schedules/` - Task scheduling
- `stats/` - Statistics
- `logs/` - Log retrieval
- `health/` - Health checks

---

## Troubleshooting

### Dev Container Issues

**Problem**: "Dev Container required" error when running npm commands

**Solution**:
```bash
# Option 1: Use Dev Container (recommended)
# In VS Code/Cursor: "Reopen in Container"

# Option 2: Override for CI/remote PC
export SKIP_DEVCONTAINER_GUARD=1
npm ci
```

### Agent Won't Start

**Problem**: Agent fails to connect to Xiaowei

**Solution**:
1. Verify Xiaowei is running: `curl http://127.0.0.1:22222/` (Windows)
2. Check `agent/.env` has correct `XIAOWEI_WS_URL`
3. Ensure Windows Firewall allows localhost WebSocket connections
4. Check agent logs for connection errors

### Dashboard Shows No Data

**Problem**: Dashboard renders but shows empty/error states

**Solution**:
1. Verify `.env.local` has valid Supabase credentials
2. Check Supabase project is running and accessible
3. Verify API routes return data: `curl http://localhost:3000/api/workers`
4. Check browser console for errors
5. Verify middleware isn't redirecting to `/login`

### Realtime Updates Not Working

**Problem**: Dashboard doesn't update when agent changes data

**Solution**:
1. Verify Supabase Realtime is enabled (Pro Plan required)
2. Check `pg_net` extension is installed
3. Verify Broadcast triggers exist in database
4. Check browser console for WebSocket errors
5. Test with manual database UPDATE and watch for events

### Build Failures

**Problem**: `npm run build` fails with errors

**Solution**:
1. Clear cache: `npm run clean && npm run clean:cache`
2. Reinstall dependencies: `rm -rf node_modules && npm ci`
3. Check TypeScript errors: `npx tsc --noEmit`
4. Review `next.config.js` settings
5. Ensure all environment variables are set

### Test Failures

**Problem**: `npm run test` fails

**Solution**:
1. Install agent dependencies: `cd agent && npm ci`
2. Set environment flag: `export SKIP_DEVCONTAINER_GUARD=1`
3. Clear test cache: `npx vitest run --no-cache`
4. Check test logs for specific errors
5. Run single test: `npx vitest run tests/specific.test.ts`

### Database Connection Issues

**Problem**: API routes fail with database errors

**Solution**:
1. Verify Supabase credentials in `.env.local`
2. Check Supabase project status in dashboard
3. Test connection: `npm run db:verify`
4. Verify database migrations applied: `npm run db:push`
5. Check Supabase logs for connection errors

### Deployment Issues

**Problem**: CI/CD pipeline fails

**Solution**:
1. Check GitHub Actions logs for specific error
2. Verify all required secrets are set in repository settings
3. Test Docker build locally: `docker build -t test-image .`
4. Verify deployment target is accessible
5. Check deployment logs on target server

---

## Quick Reference

### Environment Variables

**Dashboard (`.env.local`)**:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
YOUTUBE_API_KEY=AIza...
```

**Agent (`agent/.env`)**:
```bash
PC_NUMBER=1
WORKER_NAME=PC-01
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
XIAOWEI_WS_URL=ws://127.0.0.1:22222/
LOG_LEVEL=info
```

### Common Commands

```bash
# Development
npm run dev                          # Start dashboard
cd agent && node agent.js           # Start agent

# Testing
npm run test                        # Unit tests
npm run test:e2e                    # E2E tests
npm run lint                        # Linting

# Building
npm run build                       # Production build
npm start                           # Production server

# Database
npm run db:push                     # Apply migrations
npm run db:verify                   # Validate schema

# Utilities
npm run clean                       # Clear build cache
cd agent && npm ci                  # Install agent deps
```

### Supabase Broadcast Channels

| Channel | Purpose |
|---------|---------|
| `room:dashboard` | Global statistics |
| `room:workers` | Worker list changes |
| `room:worker:<id>` | Individual worker status |
| `room:devices` | Device grid updates (500 devices) |
| `room:tasks` | Task list changes |
| `room:task:<id>:logs` | Task log streaming |
| `room:task_logs` | Global log monitoring |
| `room:system` | System notifications |

---

## Final Notes

1. **Always read `ARCHITECTURE.md`** before making significant changes
2. **Use Dev Container** for consistent development environment
3. **Test locally** before pushing (lint, test, build)
4. **Check CI logs** if builds fail
5. **Monitor Supabase** quotas and usage
6. **Keep agent dependencies separate** - install in both root and `agent/`
7. **Document new patterns** in this file for future agents
8. **Ask questions** if something is unclear - better to confirm than break production

---

**Questions or Issues?** Check existing documentation first:
- `ARCHITECTURE.md` - System design
- `README.md` - User documentation
- `DEPLOYMENT.md` - Deployment procedures
- GitHub Issues - Known problems and solutions
