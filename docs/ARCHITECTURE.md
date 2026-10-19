# Architecture and correctness

## A deliberately small system

ClubOps is a modular Django monolith plus a React SPA. Vite proxies `/api/` and `/graphql/` to Django, keeping cookies and CSRF same-origin. PostgreSQL is the only datastore. Docker Compose runs three services: database, backend, frontend. No queue, cache service, microservices, or background jobs are required.

The critical write path is:

```text
React form → generated Apollo operation → Strawberry resolver
          → domain service → Django transaction → PostgreSQL
```

Resolvers perform transport conversion and expose a small typed schema. `requests_app/services.py` owns validation, membership checks, policy decisions, state transitions, and locking. Components consume server-calculated `canReview`/`canCancel` flags for usability; services independently enforce the same permissions.

## Data model

| Model | Responsibility |
|---|---|
| Django User | Password hashing and authenticated identity |
| Organization | Allocated budget, committed spending, current approval threshold; the budget lock row |
| Membership | One unique `(organization, user)` pair and one of three roles |
| SpendingRequest | Immutable submitted details and organization, Decimal amount, captured required role, current status |
| AuditEvent | Actor, timestamp, source state, destination state; one event per reached state |

Every organization has an independent budget. All amounts are USD `DecimalField(max_digits=12, decimal_places=2)`. The API accepts/returns decimal strings; forms preserve strings; display formatting uses integer/string handling. Only the decorative budget progress percentage uses a JavaScript number.

Database checks enforce positive amounts and thresholds, known enum values, valid audit transitions, nonnegative spending, and spending at or below budget. A unique constraint on `(request, to_status)` provides a second defense against duplicate audit events. User and organization references on historical records use `PROTECT` to preserve history.

`approved_spending` is a small denormalized ledger total. Only the approval service changes it, in the same transaction as the request and audit event. Request amounts cannot be edited or deleted through the API. Direct SQL/ORM edits bypass service invariants and are not supported application operations.

## Authorization

| Operation | Member | Treasurer | Admin |
|---|---|---|---|
| Read organization budget, team, requests, history | Own organizations | Own organizations | Own organizations |
| Create request | Yes | Yes | Yes |
| Cancel request | Own pending requests | Own pending requests | Own pending requests |
| Approve/reject treasurer-level request | No | Yes | Yes |
| Approve/reject admin-level request | No | No | Yes |
| Update threshold | No | No | Yes |

Being an admin in one organization grants no access to another. Requests are resolved through the caller's memberships before any details are returned. Unauthorized and nonexistent IDs share the same not-found response. Nested budget, member, and history resolvers also verify access. Django's `is_staff`/`is_superuser` flags do not bypass organization permissions.

Approvers may review their own submissions; the requested MVP does not impose separation of duties. Every organization member may see the organization's requests and history. There are no membership-editing or account-provisioning endpoints.

## Policy snapshot

At creation, the service locks the organization row, reads its threshold, and stores `required_role` on the new request:

- `amount < threshold` → `TREASURER` (admin can also review).
- `amount >= threshold` → `ADMIN`.

Policy updates lock that same organization row. Thus a concurrent submission and policy update are serialized: the request captures either the preceding or following policy, never a partial policy. Later changes do not reclassify existing requests.

## State machine and retry semantics

```text
               APPROVED
              /
created → PENDING → REJECTED
              \
               CANCELLED
```

Creation writes an audit event from the empty initial state to `PENDING`. Each successful terminal transition writes exactly one event from `PENDING`. Failed authorization, invalid state changes, and insufficient-budget errors leave all records unchanged.

A retry requesting the **same terminal state** returns the existing request, after checking the caller's current authorization. It creates no event and moves no money. This applies to approve, reject, and cancel. A different terminal action returns `INVALID_TRANSITION`.

Creation does not accept an idempotency key; deliberately submitting twice creates two distinct pending requests. If a network connection is lost after submission, check the request list before submitting again. State transitions are safe to retry.

## Concurrent approval algorithm

Inside `transaction.atomic()`:

1. Resolve a request only if the user belongs to its organization.
2. Acquire `SELECT ... FOR UPDATE` on the **organization** row.
3. Acquire `SELECT ... FOR UPDATE` on the **request** row.
4. Recheck membership/role and current request state after the locks are acquired.
5. For approval, compare the request's Decimal amount to `total_budget - approved_spending`.
6. Increment spending, write the terminal state, and insert the audit event.
7. Commit all three writes together, or roll everything back.

All transitions, including rejection and cancellation, use organization → request lock order. Creation and policy updates take only the organization lock. The MVP processes one request per transaction; it does not expose bulk approval operations.

Example: two requests each need $600 with $1,000 remaining. One transaction locks the organization first; the other waits. The winner commits $600. The waiting transaction then sees only $400 remaining and fails, leaving its request pending. PostgreSQL's ordinary READ COMMITTED isolation is sufficient because the relevant budget row is explicitly locked.

The concurrency tests hold the organization lock in a coordinator transaction and wait until two independent connections attempt to acquire it. They then release the lock and assert the committed financial and audit outcomes. They also test simultaneous identical approvals and approval/rejection races. The tests explicitly require PostgreSQL.

Dashboard budget numbers are a live read view, not a transactionally frozen financial report; pending totals can change between read queries. Approval decisions always read the locked, current budget.

## Session and API security

Django performs authentication, salted password hashing, session rotation, session persistence, and CSRF validation. `GET /api/session/` bootstraps the CSRF cookie. Login, logout, and GraphQL POSTs require `X-CSRFToken`. The client rereads the cookie on each operation because login rotates it. Session cookies are HTTP-only and SameSite=Lax. Secure cookies are enabled whenever debug is disabled.

Core GraphQL operations are POST-only; the development GraphiQL IDE is disabled outside debug mode. Query nesting is limited to eight levels, lists to 100 requests per page, and request bodies to 64 KiB. Expected failures expose stable error codes and actionable messages. Unexpected resolver errors are masked; server logs retain diagnostics. There are no third-party authentication tokens in browser storage.

This is a local development MVP. Before making it public, configure TLS, secret management, permitted hosts/origins, login rate limiting, backups, monitoring, a production static frontend server, and deployment-specific security settings. The supplied Compose stack intentionally serves the frontend with Vite for local development.

## Frontend organization

- `components/`: layout, budget/table primitives, loading/error/empty feedback.
- `pages/`: login, dashboard, requests/inbox, request form, details/history, policy/team.
- `graphql/operations.graphql`: the operations the UI actually uses.
- `graphql/generated.ts`: generated result/input types and `TypedDocumentNode` operations.
- `hooks/useAuth.tsx`: session bootstrap, login/logout, cache clearing.
- `scripts/codegen.mjs`: Codegen's official core API with two explicit local inputs; no schema discovery service.

The backend schema is exported to `backend/schema.graphql`. CI regenerates both the schema and client artifacts and fails on drift. Apollo refetches active budget/request/history queries after mutations; polling and real-time updates are out of scope. Separate sessions see new data on navigation or refresh.

## Verification and references

See `PROGRESS.md` for commands actually run and observed results. The GitHub workflow definition includes PostgreSQL tests, schema drift detection, TypeScript checks, build, and two Chromium workflows. A local success is not a claim that a hosted GitHub run occurred.

Implementation references: [Django integration for Strawberry](https://strawberry.rocks/docs/integrations/django), [typed Apollo operations](https://www.apollographql.com/docs/react/data/typescript), and [GraphQL Code Generator core API](https://the-guild.dev/graphql/codegen/docs/advanced/programmatic-usage).
