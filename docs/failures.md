# Failure analysis

The first full eval (kept as `docs/results/v1-gemini-3.5-flash-lite`) scored 25 of 30. The agent named the right component every time; the five misses were all "right component, wrong category". Reading the traces showed that only some of those were the agent's fault. This file records what each miss really was and what changed.

## 1. The broken service's logs never arrived

**Scenario 010.** Orders is pointed at a database host that does not exist. The agent reported `connection_pool_exhaustion`; the truth is `wrong_config`.

**What the agent saw.** No error logs from orders at all, and a pool metric showing requests waiting. It guessed.

**Why.** Two problems in the demo system, not in the agent:

- Log shipping opened a new connection for each batch. That needs a DNS lookup, and Node runs lookups on a four-thread pool that was saturated by the service's own failing lookups of the bad host. The batches timed out and were dropped. The one service with something to say was silent.
- The database driver reports every failure to get a connection as `timeout exceeded when trying to connect`. A failed lookup takes 2 to 3 seconds here, the pool gave up after 2, so the real error (`ENOTFOUND`) never surfaced. An unreachable database and a full pool produced the same message.

**What changed.**

- The log shipper keeps one connection open and puts a failed batch back in the buffer.
- The DNS thread pool is larger (`UV_THREADPOOL_SIZE`).
- On a connection timeout the service logs the host and how many connections were really established, and checks whether the host resolves:
  `timed out waiting for a database connection (host pg-primary, 0 of 10 connections established)` and `database host "pg-primary" cannot be resolved: ENOTFOUND`.

**Result.** Correct on re-run.

**Lesson.** An agent can only be as good as the telemetry. The most useful question after a wrong answer was "what evidence did it have?", not "why did the model get it wrong?".

## 2. Right diagnosis, wrong label

**Scenarios 019 and 020.** A release wraps a query in a transaction and never releases the connection on one code path. The agent reported `bad_code_deploy`; the truth is `connection_pool_exhaustion`.

**What the agent saw.** Everything. Its explanation for 019 reads: the release "wraps order inserts in an explicit transaction but fails to commit or rollback under certain conditions (leaving connections idle in transaction). This leaks connections from the pool until the pool is completely exhausted."

**Why.** The category definitions overlapped. A release did cause it, so `bad_code_deploy` was defensible. The rubric did not say which to prefer.

**What changed.** The definitions now say to pick the most specific mechanism the evidence supports, and that a release can be what introduced a leak or slowness.

**Result.** Both correct on re-run.

**Lesson.** A deterministic score needs categories that cannot both be true. This was a flaw in the eval, and fixing the rubric is different from coaching the answer: the change describes mechanisms in general and says nothing about any scenario.

## 3. The previous incident was still on screen

**Scenarios 023 and 024.** A release adds CPU work per request and the service slows down. Even after the fixes above, the agent reported `connection_pool_exhaustion` for 023.

**What the agent saw.** Pool metrics at 10 of 10 with 58 requests waiting, and hundreds of connection-timeout errors, all from version 1.4.4. The scenario under test was version 1.4.3.

**Why.** Scenarios run back to back and the agent looks 15 to 30 minutes into the past. It was reading the connection-leak incident injected into the same service a few minutes earlier. The harness was leaking one scenario into the next.

**What changed.** Each scenario now starts from a clean history: Prometheus is recreated, logs are cleared, and the healthy system runs for 90 seconds to give a fresh baseline before the fault.

**Result.** The contamination is gone. See the next section for what remained.

**Lesson.** This inflated or deflated every result in the first run in ways I could not see from the score. An eval where cases are not independent is measuring the order of the cases.

## 4. Still open: slow services are filed under "bad release"

**Scenarios 023 and 024**, with clean history. The agent now explains the fault correctly. For 023: the release "derives a signing key per request. This heavy cryptographic/CPU operation caused increased CPU usage, event loop lag, and a spike in P95 latency." It then submits `bad_code_deploy` where the truth is `slow_dependency`.

**Why.** The rubric says to prefer the mechanism over the trigger, and for slowness the model does not follow it. The category name does not help: "slow dependency" describes the service from its caller's point of view.

**What I did not do.** Reword the definitions again until these two pass. They had already been sharpened once in response to failures; a second round aimed at two specific scenarios would be fitting the test.

**What I would try next.** Rename the category to describe the service itself, validate the rubric on scenarios the agent has not been tuned against, and compare a larger model on the same two cases to see whether this is a limit of the model or of the wording.

## 5. One scenario moves between runs

**Scenario 020** (the inventory connection leak) was correct in a targeted re-run and partial in the final full run, with no change in between. The agent's explanation was right both times; only the label differed.

**Lesson.** A single run of 30 scenarios is good to within a scenario or two. Reporting 27 of 30 as "about 90%" is fair; reading meaning into 27 versus 28 is not. Running each scenario several times and reporting the spread would fix this, and costs more free-tier quota than was available.

## What the comparison runs show

- **Alert-only baseline: 8 of 30.** One model call that sees only the alert text. The alert does not give the answer away; the gap to the agent's score is what investigation is worth.
- **First version versus final: 25 to 27 of 30.** The gain came from fixing the telemetry, the rubric and the harness, as described above, not from changing the model.
