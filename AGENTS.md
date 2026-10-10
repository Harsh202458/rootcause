# RootCause: project rules

## What this is
An autonomous agent that investigates incidents in a demo microservice system and
reports the root cause. A fault injector creates known failures; an eval harness
scores the agent against them.

## Hard constraints
- Zero paid services. Only free tiers and open-source software.
- Development machine is Windows 10 with Docker Desktop. All scripts must be
  Node.js/TypeScript scripts run with npm, never bash.
- TypeScript strict mode everywhere. Node 20+. npm workspaces monorepo.
- Ask before adding any dependency that is not listed in the phase prompt.
- Every phase ends with tests passing and a short walkthrough of what was built.

## Repo layout
/services/gateway  /services/orders  /services/inventory  /services/payments
/loadgen           traffic generator
/infra             docker-compose.yml, Prometheus, Loki, Grafana config
/faults            fault scenarios (YAML) and the injector
/agent             agent loop, tools, LLM providers, tracing
/evals             eval runner and reports
/dashboard         Next.js trace viewer and approval queue
/docs              architecture notes and results

## Rules that protect the eval (never break these)
- The agent must never be able to see ground truth. No fault names in env vars,
  container labels, log lines, file names the agent can read, or tool output.
- Every agent tool is read-only. The only write the agent can make is inserting
  a row into the fix-proposal table for a human to approve.
- Tool outputs are truncated to a fixed size so they cannot blow the token budget.
- The LLM is reached only through the LLMProvider interface in /agent/src/providers.
