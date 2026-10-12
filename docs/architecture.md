# Architecture

## The pieces

| Package | Role |
|---|---|
| `services/` | The demo system: gateway, orders, inventory, payments and the load generator. One codebase and one Docker image; the `SERVICE` variable picks the entry point. |
| `infra/` | Docker Compose, Prometheus scrape config and alert rules, database schema. |
| `faults/` | Scenario files, the injector, health checks, and the `verify` command. |
| `agent/` | The agent loop, its tools, the LLM providers and run tracing. |
| `evals/` | The eval runner, scoring and report generation. |
| `dashboard/` | Next.js app: run list, step-by-step trace, eval results, fix approvals. |

## The demo system

```
loadgen -> gateway -> inventory -> postgres, redis
                   -> payments
                   -> orders    -> postgres
```

- **Checkout** reads the product, reserves stock (under a Redis lock), charges the card, then writes the order. Any upstream failure becomes a 502 at the gateway that names the upstream.
- **Metrics.** Every service exposes request counts and durations by route, process memory and CPU, event loop lag, database pool gauges and query durations. Prometheus scrapes every 5 seconds.
- **Logs.** Every request and every notable event is written to stdout and shipped in batches to the `logs` table in the `ops` database. The log connection is separate from the application database connection, so a service that loses its own database can still report it.
- **Alerts.** Four rules: error rate above 5%, p95 latency above a threshold, service down, memory above 150 MB.

### How a fault reaches a service

The Compose file reads each service's version and a few settings from variables such as `ORDERS_VERSION` and `INVENTORY_REDIS_HOST`. A deploy is the injector recreating that one container with a variable set, exactly as a release pipeline would roll a new version or config. `services/src/lib/release.ts` maps each version after 1.4.0 to one feature, and each feature carries one regression. Nothing in a running container says which.

Other faults act from outside: SQL against the database, a held-open session for locks, Docker stop, pause and network disconnect, and one operator endpoint on payments that simulates a slow card processor.

## The agent loop

```
alert -> [ model chooses tool calls -> tools run -> results appended ] -> submit_report
```

1. The model receives a system prompt describing the system, and the alert text.
2. Each turn it may call several tools. Results are truncated to 4,000 characters and prefixed with the call id, which the model cites later as evidence.
3. `submit_report` is validated before it is accepted: the schema must hold, there must be at least one evidence item, and every cited id must be a tool call from this run. A rejected report goes back to the model with the reason.
4. Limits: 15 steps, a token budget and a wall-clock timeout. At a limit the model gets one final call and must report; that report is kept but marked unverified.

Every model turn and tool call is written to the `runs` and `steps` tables. The agent's own database role cannot read them.

### Providers

`LLMProvider` is one method: `chat(messages, tools)`. The Gemini provider handles the details that differ from the generic shape: it mints its own tool call ids (Gemini has none), replays the model's original parts so thought signatures survive, sends all results for one turn together, paces requests to the free-tier rate, and separates a per-minute limit (wait and retry) from a daily one (stop).

## The eval

For each scenario:

1. **Clean history.** Wait for a healthy system, recreate Prometheus, clear logs, run 90 seconds of baseline.
2. **Inject**, and record the scenario's deploy events (the culprit if there is one, plus harmless ones).
3. **Wait for the alert** the agent will be paged with. If it never fires, the run stops.
4. **Run the agent** with the alert text.
5. **Score** component and category against ground truth. Store the verdict with the run.
6. **Revert**, remove the scenario's deploy events, and wait for the system to recover.

If the model is unavailable, the scenario is not scored and the run can be resumed. Results are written after every scenario.

### What keeps it honest

- `npm run fault -- verify` proves each fault independently of the agent: alert fires, no giveaway words in logs or deploy history, system recovers.
- The agent's tools expose no environment variables or labels, and its database role sees only application tables, deploy history and logs.
- Scoring is a string comparison. There is no judge model to be lenient.
- Failures of the harness or the provider stop the run instead of becoming wrong answers or, worse, invented ones.
