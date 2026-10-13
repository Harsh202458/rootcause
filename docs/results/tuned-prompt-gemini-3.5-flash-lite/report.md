# Evaluation Report: tuned-prompt-gemini-3.5-flash-lite

**Timestamp:** 2026-10-13T16:01:24.428Z
**Provider:** gemini
**Model:** gemini-3.5-flash-lite
**Tool Set:** full
**Baseline Mode:** No

## Summary

* **Total Scenarios:** 5
* **Correct:** 2 (40.0%)
* **Partial:** 0 (0.0%)
* **Wrong:** 3
* **Partial Accuracy (Correct + Partial):** 40.0%

## Performance Metrics (Median)

* **Steps:** 3
* **Tokens:** 7999
* **Duration:** 1191.2s

## Accuracy by Category

| Category | Total | Correct | Partial | Wrong |
|---|---|---|---|---|
| bad_code_deploy | 3 | 2 | 0 | 1 |
| dropped_index | 2 | 0 | 0 | 2 |

## Failures


### scenario-003
* **Expected:** Component `inventory`, Category `bad_code_deploy`
* **Actual:** Component `unknown`, Category `unknown`
* **Explanation:** Agent did not produce a valid report


### scenario-004
* **Expected:** Component `postgres`, Category `dropped_index`
* **Actual:** Component `unknown`, Category `unknown`
* **Explanation:** Agent did not produce a valid report


### scenario-005
* **Expected:** Component `postgres`, Category `dropped_index`
* **Actual:** Component `unknown`, Category `unknown`
* **Explanation:** Agent did not produce a valid report

