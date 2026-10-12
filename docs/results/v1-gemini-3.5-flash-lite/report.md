# Evaluation Report: gemini-3.5-flash-lite

**Timestamp:** 2026-10-11T19:53:45.276Z
**Provider:** gemini
**Model:** gemini-3.5-flash-lite
**Tool Set:** full
**Baseline Mode:** No

## Summary

* **Total Scenarios:** 30
* **Correct:** 25 (83.3%)
* **Partial:** 5 (16.7%)
* **Wrong:** 0
* **Partial Accuracy (Correct + Partial):** 100.0%

## Performance Metrics (Median)

* **Steps:** 9
* **Tokens:** 36979.5
* **Duration:** 55.4s

## Accuracy by Category

| Category | Total | Correct | Partial | Wrong |
|---|---|---|---|---|
| bad_code_deploy | 3 | 3 | 0 | 0 |
| dropped_index | 3 | 3 | 0 | 0 |
| memory_leak | 3 | 3 | 0 | 0 |
| wrong_config | 3 | 2 | 1 | 0 |
| dependency_down | 3 | 3 | 0 | 0 |
| redis_unavailable | 3 | 3 | 0 | 0 |
| connection_pool_exhaustion | 3 | 1 | 2 | 0 |
| slow_dependency | 3 | 1 | 2 | 0 |
| long_running_lock | 3 | 3 | 0 | 0 |
| bad_migration | 3 | 3 | 0 | 0 |

## Failures


### scenario-010
* **Expected:** Component `orders`, Category `wrong_config`
* **Actual:** Component `orders`, Category `connection_pool_exhaustion`
* **Explanation:** Expected orders/wrong_config, got orders/connection_pool_exhaustion


### scenario-019
* **Expected:** Component `orders`, Category `connection_pool_exhaustion`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected orders/connection_pool_exhaustion, got orders/bad_code_deploy


### scenario-020
* **Expected:** Component `inventory`, Category `connection_pool_exhaustion`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected inventory/connection_pool_exhaustion, got inventory/bad_code_deploy


### scenario-023
* **Expected:** Component `orders`, Category `slow_dependency`
* **Actual:** Component `orders`, Category `connection_pool_exhaustion`
* **Explanation:** Expected orders/slow_dependency, got orders/connection_pool_exhaustion


### scenario-024
* **Expected:** Component `inventory`, Category `slow_dependency`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected inventory/slow_dependency, got inventory/bad_code_deploy

