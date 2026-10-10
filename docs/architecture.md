# RootCause Architecture

## Overview

RootCause is structured as an npm workspaces monorepo with four layers:

1. **Demo System** — The microservices being investigated
2. **Observability** — The data sources the agent reads
3. **Agent** — The investigation loop and tools
4. **Eval** — The scoring and reporting framework

## Demo System

### Service Architecture

```
Client → Gateway (:3000) → Orders (:3001)    → PostgreSQL
                         → Inventory (:3002)  → PostgreSQL + Redis
                         → Payments (:3003)   (mock, no persistence)
```

**Checkout flow:**
1. Gateway receives `POST /checkout { customerId, productId, quantity }`
2. Gateway calls Inventory to get product price and verify stock
3. Gateway calls Inventory to reserve stock (atomic decrement)
4. Gateway calls Payments to process payment (mock, 50-200ms latency)
5. Gateway calls Orders to create the order record
6. Gateway returns the completed order to the client

**Key design decisions:**
- Connection pools are configurable (`DB_POOL_MIN`, `DB_POOL_MAX`) so fault injection can exhaust them
- Redis caching in Inventory has a fallback to PostgreSQL, so Redis faults degrade performance but don't break functionality
- Request IDs (`x-request-id`) propagate across all service calls for traceability
- Each service has independent health checks and metrics endpoints

### Database Schema

Two databases:
- `rootcause` — Application data (products, orders)
- `ops` — Operational data (deploy events, runs, steps, fix proposals)

The `agent_readonly` PostgreSQL role has SELECT-only access to both databases.

## Observability Layer

### Structured Logging (pino)
Every log line includes: `timestamp`, `level`, `service`, `version`, `request_id`, `route`, `status`, `duration_ms`, `error`.

Logs are shipped to Loki via pino-loki transport. A Loki outage never crashes a service.

### Metrics (prom-client)
Each service exposes `/metrics` with:
- HTTP request count and duration histogram (by route and status)
- Database pool stats (in-use, idle, waiting)
- Database query duration histogram
- Redis cache hit/miss counters (Inventory only)
- Process memory and event loop lag

### Deploy History
The `deploy_events` table records every change:
- `kind`: 'code' (version bump), 'config' (setting change), 'migration' (schema change)
- Version tracking with `from_version` and `to_version`
- Human-readable `summary` and `diff_summary`

### Alerts
Prometheus alert rules fire on:
- High error rate (>5% 5xx for 1 minute)
- High p95 latency (>2s for 1 minute)
- Service down (unreachable for 30s)
- High memory (>200MB for 2 minutes)

## Agent

### Tool Architecture

The agent has 7 read-only tools plus `submit_report`:

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `list_alerts` | Currently firing alerts | Prometheus API |
| `service_health` | Container status, version, memory | Docker Engine API |
| `query_metrics` | Named metrics (no raw PromQL) | Prometheus API |
| `query_logs` | Grouped log entries | Loki API / PostgreSQL |
| `recent_deploys` | Deploy history | PostgreSQL (ops) |
| `run_sql_readonly` | Ad-hoc SELECT queries | PostgreSQL (readonly role) |
| `propose_fix` | Submit fix proposal | PostgreSQL (ops) - write |
| `submit_report` | Final investigation report | In-memory validation |

All tool outputs are truncated to 4,000 characters to prevent token budget blowout.

### Investigation Loop

```
┌─────────────────────────────────────────────┐
│ 1. Receive alert                            │
│ 2. Initialize with system prompt + alert    │
│ 3. Loop (max 15 steps):                     │
│    a. Send messages to LLM                  │
│    b. LLM returns tool calls or text        │
│    c. Execute tools, add results to context │
│    d. If submit_report: validate & return   │
│ 4. If limit hit: force final report         │
└─────────────────────────────────────────────┘
```

### LLM Providers

Three swappable providers behind the `LLMProvider` interface:
- **Gemini** (free tier) — generativelanguage.googleapis.com
- **Groq** (free tier) — api.groq.com (OpenAI-compatible)
- **Ollama** (local) — localhost:11434

Each provider has:
- Exponential backoff retry on rate limits (429)
- Per-minute request limiter (respects free-tier limits)
- Response caching (toggle with `RESPONSE_CACHE_ENABLED`)

### System Prompt

The system prompt teaches an investigation methodology:
1. Confirm the symptom (alerts + metrics)
2. Scope the impact (which services affected)
3. Check what changed (recent deploys)
4. Correlate with data (logs + metrics patterns)
5. Form a hypothesis
6. Verify (find evidence that could disprove it)
7. Report with evidence-linked findings

It contains NO hints about specific fault types.

## Eval Framework

### Fault Injection

30 scenarios across 10 fault categories:

| # | Category | What Breaks |
|---|----------|-------------|
| 1 | bad_code_deploy | 500s on one route after version bump |
| 2 | dropped_index | Latency climbs, slow queries |
| 3 | memory_leak | Memory rises, container restarts |
| 4 | wrong_config | Service can't reach DB/cache |
| 5 | dependency_down | One service unreachable |
| 6 | redis_unavailable | Cache misses spike |
| 7 | connection_pool_exhaustion | Requests queue and timeout |
| 8 | slow_dependency | Timeouts cascade |
| 9 | long_running_lock | Table blocked by stuck transaction |
| 10 | bad_migration | Column change breaks queries |

Each scenario has:
- 2-4 decoy deploy events (so the latest deploy isn't always the culprit)
- Ground truth (component + category + expected evidence)
- Inject and revert steps for clean back-to-back execution

### Scoring

Deterministic (no LLM judge):
- **Correct**: component AND category match ground truth
- **Partial**: component matches, category doesn't
- **Wrong**: neither matches

### Anti-Cheat Measures

- Scenario IDs are opaque (`scenario-001`, not `bad-deploy-test`)
- No fault type names in env vars, container labels, logs, or metrics
- Deploy events during injection use realistic commit summaries
- Leak audit test verifies no ground truth leakage in any observable surface

## Tracing

Every investigation run is recorded in the `ops` database:
- `runs` table: alert, provider, model, report, totals
- `steps` table: per-step messages, tool calls, results, token counts, durations

The dashboard reads these tables to render the investigation timeline.
