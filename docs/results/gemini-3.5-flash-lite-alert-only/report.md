# Evaluation Report: gemini-3.5-flash-lite-alert-only

**Timestamp:** 2026-10-11T20:00:36.640Z
**Provider:** gemini
**Model:** gemini-3.5-flash-lite
**Tool Set:** full
**Baseline Mode:** Yes

## Summary

* **Total Scenarios:** 30
* **Correct:** 8 (26.7%)
* **Partial:** 6 (20.0%)
* **Wrong:** 16
* **Partial Accuracy (Correct + Partial):** 46.7%

## Performance Metrics (Median)

* **Steps:** 1
* **Tokens:** 127
* **Duration:** 6.5s

## Accuracy by Category

| Category | Total | Correct | Partial | Wrong |
|---|---|---|---|---|
| bad_code_deploy | 3 | 2 | 1 | 0 |
| dropped_index | 3 | 1 | 0 | 2 |
| memory_leak | 3 | 3 | 0 | 0 |
| wrong_config | 3 | 0 | 2 | 1 |
| dependency_down | 3 | 0 | 0 | 3 |
| redis_unavailable | 3 | 0 | 0 | 3 |
| connection_pool_exhaustion | 3 | 0 | 3 | 0 |
| slow_dependency | 3 | 2 | 0 | 1 |
| long_running_lock | 3 | 0 | 0 | 3 |
| bad_migration | 3 | 0 | 0 | 3 |

## Failures


### scenario-001
* **Expected:** Component `gateway`, Category `bad_code_deploy`
* **Actual:** Component `gateway`, Category `wrong_config`
* **Explanation:** Expected gateway/bad_code_deploy, got gateway/wrong_config


### scenario-004
* **Expected:** Component `postgres`, Category `dropped_index`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/dropped_index, got orders/bad_code_deploy


### scenario-005
* **Expected:** Component `postgres`, Category `dropped_index`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/dropped_index, got orders/bad_code_deploy


### scenario-010
* **Expected:** Component `orders`, Category `wrong_config`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected orders/wrong_config, got orders/bad_code_deploy


### scenario-011
* **Expected:** Component `inventory`, Category `wrong_config`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected inventory/wrong_config, got inventory/bad_code_deploy


### scenario-012
* **Expected:** Component `inventory`, Category `wrong_config`
* **Actual:** Component `postgres`, Category `connection_pool_exhaustion`
* **Explanation:** Expected inventory/wrong_config, got postgres/connection_pool_exhaustion


### scenario-013
* **Expected:** Component `payments`, Category `dependency_down`
* **Actual:** Component `gateway`, Category `wrong_config`
* **Explanation:** Expected payments/dependency_down, got gateway/wrong_config


### scenario-014
* **Expected:** Component `orders`, Category `dependency_down`
* **Actual:** Component `gateway`, Category `bad_code_deploy`
* **Explanation:** Expected orders/dependency_down, got gateway/bad_code_deploy


### scenario-015
* **Expected:** Component `inventory`, Category `dependency_down`
* **Actual:** Component `gateway`, Category `bad_code_deploy`
* **Explanation:** Expected inventory/dependency_down, got gateway/bad_code_deploy


### scenario-016
* **Expected:** Component `redis`, Category `redis_unavailable`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected redis/redis_unavailable, got inventory/bad_code_deploy


### scenario-017
* **Expected:** Component `redis`, Category `redis_unavailable`
* **Actual:** Component `postgres`, Category `connection_pool_exhaustion`
* **Explanation:** Expected redis/redis_unavailable, got postgres/connection_pool_exhaustion


### scenario-018
* **Expected:** Component `redis`, Category `redis_unavailable`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected redis/redis_unavailable, got inventory/bad_code_deploy


### scenario-019
* **Expected:** Component `orders`, Category `connection_pool_exhaustion`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected orders/connection_pool_exhaustion, got orders/bad_code_deploy


### scenario-020
* **Expected:** Component `inventory`, Category `connection_pool_exhaustion`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected inventory/connection_pool_exhaustion, got inventory/bad_code_deploy


### scenario-021
* **Expected:** Component `orders`, Category `connection_pool_exhaustion`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected orders/connection_pool_exhaustion, got orders/bad_code_deploy


### scenario-023
* **Expected:** Component `orders`, Category `slow_dependency`
* **Actual:** Component `postgres`, Category `dropped_index`
* **Explanation:** Expected orders/slow_dependency, got postgres/dropped_index


### scenario-025
* **Expected:** Component `postgres`, Category `long_running_lock`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/long_running_lock, got orders/bad_code_deploy


### scenario-026
* **Expected:** Component `postgres`, Category `long_running_lock`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/long_running_lock, got inventory/bad_code_deploy


### scenario-027
* **Expected:** Component `postgres`, Category `long_running_lock`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/long_running_lock, got inventory/bad_code_deploy


### scenario-028
* **Expected:** Component `postgres`, Category `bad_migration`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/bad_migration, got orders/bad_code_deploy


### scenario-029
* **Expected:** Component `postgres`, Category `bad_migration`
* **Actual:** Component `inventory`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/bad_migration, got inventory/bad_code_deploy


### scenario-030
* **Expected:** Component `postgres`, Category `bad_migration`
* **Actual:** Component `orders`, Category `bad_code_deploy`
* **Explanation:** Expected postgres/bad_migration, got orders/bad_code_deploy

