# Failure Analysis

## Overview
This document records notable failure cases from eval runs, what caused the agent to get the wrong answer, and what changes improved accuracy. This is the most important interview material.

## Failure Case 1: [Fault Category]

**Scenario:** [scenario ID]
**Expected:** component=`___`, category=`___`
**Agent said:** component=`___`, category=`___`
**Score:** wrong / partial

### What happened
[Describe the injected fault and what symptoms it caused]

### What the agent did
[Walk through the agent's investigation steps — what tools it called, what data it saw]

### Why it got it wrong
[Root cause of the misdiagnosis — e.g., confused similar symptoms, missed a key tool call, fixated on a decoy deploy]

### What I changed
[What tool improvement, prompt change, or system change fixed it]

### Result
[Before accuracy → After accuracy for this category]

---

## Failure Case 2: [Fault Category]

**Scenario:** [scenario ID]
**Expected:** component=`___`, category=`___`
**Agent said:** component=`___`, category=`___`
**Score:** wrong / partial

### What happened
[...]

### What the agent did
[...]

### Why it got it wrong
[...]

### What I changed
[...]

### Result
[...]

---

## Failure Case 3: [Fault Category]

**Scenario:** [scenario ID]
**Expected:** component=`___`, category=`___`
**Agent said:** component=`___`, category=`___`
**Score:** wrong / partial

### What happened
[...]

### What the agent did
[...]

### Why it got it wrong
[...]

### What I changed
[...]

### Result
[...]

---

## Summary of Improvements

| Round | Change Made | Accuracy Before | Accuracy After | Key Category Improved |
|-------|------------|----------------|----------------|----------------------|
| 1 | [initial run] | - | X% | - |
| 2 | [change] | X% | Y% | [category] |
| 3 | [change] | Y% | Z% | [category] |

## Lessons Learned
1. [Key insight about agent investigation behavior]
2. [Key insight about tool design]
3. [Key insight about prompt engineering for investigation tasks]
