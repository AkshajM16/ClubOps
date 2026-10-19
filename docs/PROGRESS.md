# ClubOps implementation progress

## Plan and acceptance criteria

A modular Django monolith owns authentication, authorization, financial rules, and persistence. React uses same-origin session/CSRF endpoints and typed GraphQL operations. PostgreSQL is mandatory, including in tests.

Minimum models: Django User; Organization (allocated budget, approved spending, approval threshold); Membership (organization/user/role); SpendingRequest (details, submitter, captured approver role, state); AuditEvent (actor, transition, timestamp). Organization is also the budget lock row. No additional infrastructure.

1. **Foundation (4–5 student hours):** Django/PostgreSQL, React/Vite, CSRF-protected sessions, reproducible seed and Compose. Acceptance: demo login and authenticated organization query work.
2. **Backend (9–10 hours):** services, migration, GraphQL, validation, state machine, budget locks. Acceptance: create → approve updates budget exactly once; every query/mutation enforces membership and role.
3. **Frontend (10–12 hours):** login, dashboard, requests/detail/create, approval inbox, settings. Acceptance: all screens use backend data and core workflow works across roles.
4. **Reliability (7–8 hours):** focused PostgreSQL tests, threaded concurrency tests, two real Playwright workflows, CI. Acceptance: backend tests, typecheck, build, E2E pass when executed.
5. **Documentation/polish (3–5 hours):** setup, architecture, demo credentials, screenshots, final review. Acceptance: a clean checkout can be reproduced from README.

Critical path: session login → membership query → submit request → authorize/lock/approve → budget and history refresh. Polish follows correctness.

## Decisions

- Approval threshold is snapshotted as required role on creation; equality requires admin.
- All state transitions lock organization first, then request. A retry of the same terminal action returns the existing request after authorization; conflicting actions fail.
- Decimal money only. Database constraints defend positive amounts and budget bounds.
- Seeded accounts only; no invitations, payments, notifications, or upload features.
- Docker CLI is installed but daemon is unavailable. Provision local PostgreSQL for actual verification; still deliver Compose.

## Status

- Repository inspected: supplied Zip directory was empty.
- Plan recorded before implementation.
- Milestones 1–5 pending.

## Tests executed

None yet. No passing tests claimed.

## Next steps

Build foundation and services, verify the API, connect the frontend, then run reliability tests and document observed results.

## Milestones 1–3 implementation update

- Foundation implemented: Python 3.12 environment, PostgreSQL 17, migrations, Django sessions and CSRF, seed command, Compose configuration, React/Vite/Tailwind.
- Backend implemented: model constraints, service layer, organization → request locks, retry-safe transitions, snapshot approval roles, typed Strawberry API with depth limit and safe errors.
- Frontend implemented: responsive login, dashboard, filtered/paginated requests, create/details/history, approval inbox, admin policy settings and team roles. Apollo operations generated from exported schema.
- Executed: database migrations succeeded; seed command succeeded; Django system check reported no issues; GraphQL code generation succeeded.
- Full test/build acceptance remains pending. npm installation reported dependency advisories; reviewing before final acceptance.

## Milestone 4 — verified locally

- Backend: `pytest backend/tests -q` — **52 passed**, including three forced-contention PostgreSQL tests (18.74 seconds on the final backend run so far).
- `manage.py check` — no issues. `makemigrations --check --dry-run` — no changes.
- Browser workflows: `npm run test:e2e` — **2 passed** (3.2 seconds), actual Django/PostgreSQL backend and Chromium; no mocks.
- Browser verification covers incorrect credentials, member dashboard, organization isolation in the selector, mobile viewport width, read-only member settings, logout, request submission, treasurer inbox/approval, precise budget increment, persistent history, and terminal-state controls.
- Initial browser failures exposed mobile overflow from an absolutely positioned hidden table heading and ambiguous form labels. Fixed the actual UI; both workflows now pass.
- Replaced the GraphQL Codegen discovery CLI with the official core API and direct local inputs. Removed 187 unnecessary transitive packages; `npm audit` reports **0 vulnerabilities**. Updated generated operations for the current standalone operations plugin.
- `npm run typecheck` passed after code-generation updates. Final build/format verification is in progress.
- Backend format/import cleanup and per-request Strawberry extension factories applied; 52 backend tests reran without warnings. Ruff checks passed.
- CI workflow implemented with PostgreSQL, schema drift checks, typecheck/build, and both E2E workflows. Not run on GitHub (no remote repository configured).

## Remaining work

Finish README, inspect final screenshots, verify Docker Compose if Docker Desktop starts, and record final validation/limitations. Package source without credentials, dependencies, or database files.
