# Fjällkompis design review

> Replace all instructional text before finalising the report.

## Review identity

| Field | Value |
|---|---|
| Review | `<release or milestone>` |
| Type | Full / Focused / Field validation |
| Status | Draft / In triage / Final / Superseded |
| Date | `YYYY-MM-DD` |
| Initiated by | `<name>` |
| App version | `<version>` |
| Commit | `<SHA>` |
| Live build | `<URL or not applicable>` |
| Primary objective | `<one sentence>` |

## Executive summary

### Release judgement

**Not ready for personal field use / Ready with blockers / Ready with explicit
limitations / Ready for intended use / Field-validated**

### Summary

Write the concise two-minute conclusion: current quality, strongest evidence,
largest risks and recommended next step.

### Strongest qualities

- `<quality and evidence>`
- `<quality and evidence>`
- `<quality and evidence>`

### Most important risks

- `<risk, consequence and finding ID>`
- `<risk, consequence and finding ID>`
- `<risk, consequence and finding ID>`

### Required before intended use

- `<accepted P0 action or “None”>`

## Scope and evidence baseline

### In scope

- `<screen, workflow, platform or system>`

### Out of scope

- `<explicit exclusion and reason>`

### Design Authority lenses used

- [ ] First-time user
- [ ] Experienced hiker
- [ ] Field simulation
- [ ] Interaction and information architecture
- [ ] Visual interface
- [ ] Accessibility and outdoor usability
- [ ] Product strategy
- [ ] Systems and software integrity

Explain omitted lenses in a focused review.

### Evidence inspected

| Evidence | Version or source | Evidence class | Notes |
|---|---|---|---|
| Live companion | `<URL/version>` | Observed | |
| Screenshots | `<paths/viewports>` | Observed | |
| Repository | `<SHA>` | Observed | |
| Automated checks | `<run/results>` | Observed | |
| Prior review | `<path>` | Externally validated / Observed | |
| Field notes | `<path/date>` | Externally validated | |

### Known limitations at review start

- `<known limitation>`

## Review dashboard

The dashboard is a readable summary, not an automated or objective score.
Every rating requires a rationale.

| Dimension | Rating | Confidence | Rationale |
|---|---:|---|---|
| User comprehension | —/10 | — | |
| Field readiness | —/10 | — | |
| Interaction quality | —/10 | — | |
| Visual consistency | —/10 | — | |
| Accessibility & outdoor usability | —/10 | — | |
| Product focus | —/10 | — | |
| Systems & software integrity | —/10 | — | |
| Overall confidence | —/10 | — | |

Optional visual summary:

```text
User comprehension          ████████░░ 8.0
Field readiness             ███████░░░ 7.0
Interaction quality         ████████░░ 8.0
Visual consistency          █████████░ 9.0
Accessibility / outdoors    ███████░░░ 7.0
Product focus               █████████░ 9.0
Systems / software          █████████░ 9.0
```

## Perspective reviews

Repeat the structure for every selected lens.

### First-time user

**Question:** Can someone understand what Fjällkompis is, where they are and
what to do next without prior instruction?

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Experienced hiker

**Question:** Does the companion support a realistic hiking workflow without
creating false confidence or unnecessary distraction?

**Summary**  
`<written assessment; state clearly which claims are simulated>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Interaction and information architecture

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Visual interface

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Accessibility and outdoor usability

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Product strategy

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

### Systems and software integrity

**Summary**  
`<written assessment>`

**Strengths**

- `<strength with evidence>`

**Concerns**

- `<concern and finding ID>`

**Lens verdict**  
`<concise conclusion>`

## Field simulation

Document the complete workflow, not only isolated screens.

### Scenario 1 — Prepare at home

**Conditions:** Wi-Fi available; first installation; no prior knowledge.  
**Tasks:** Install, download required assets, select a stage, verify offline
behaviour.  
**Observed or simulated result:** `<result>`  
**Friction and risks:** `<findings>`  
**Successful support:** `<strengths>`

### Scenario 2 — Morning in a hut

**Conditions:** Limited attention; planning the walking day.  
**Tasks:** Check route, distance, elevation, next stop and daily routine.  
**Observed or simulated result:** `<result>`  
**Friction and risks:** `<findings>`  
**Successful support:** `<strengths>`

### Scenario 3 — Midday uncertainty

**Conditions:** No network; glare or rain; uncertain GPS; battery constrained.  
**Tasks:** Understand current position and decide whether to check primary
navigation tools.  
**Observed or simulated result:** `<result>`  
**Friction and risks:** `<findings>`  
**Successful support:** `<strengths>`

### Scenario 4 — Arrival and evening

**Conditions:** Fatigue; arrival at a hut or station.  
**Tasks:** Find stop information, review progress, use notes or lists, prepare
for tomorrow.  
**Observed or simulated result:** `<result>`  
**Friction and risks:** `<findings>`  
**Successful support:** `<strengths>`

### Scenario 5 — Failure and recovery

**Conditions:** App restart, update, partial download, storage problem or stage
change.  
**Tasks:** Recover without losing trust or personal data.  
**Observed or simulated result:** `<result>`  
**Friction and risks:** `<findings>`  
**Successful support:** `<strengths>`

## Cross-review synthesis

Consolidate overlapping symptoms into systemic themes.

| Theme | Lenses contributing | Related findings | Interpretation |
|---|---|---|---|
| `<theme>` | `<lenses>` | `<IDs>` | `<root issue or strength>` |

## Finding catalogue

### DR-001 — `<finding title>`

**Lens:** `<one or more lenses>`  
**Area:** `<screen/workflow/system>`  
**Evidence:** Observed / Derived / Simulated / Externally validated / Unvalidated hypothesis  
**Severity:** Critical / High / Medium / Low  
**Priority:** P0 / P1 / P2 / P3 / No action  
**Confidence:** High / Medium / Low  
**Decision:** Accepted / Accepted with revision / Needs evidence / Deferred / Rejected / Superseded

**Observation**  
`<what was seen, inferred or simulated>`

**Why it matters on the trail**  
`<practical consequence>`

**Affected scenario**  
`<where and when>`

**Recommendation**  
`<change or validation step>`

**Trade-offs**  
`<cost, complexity or downside>`

**Validation**  
`<how to verify>`

## Decision summary

| Finding | Decision | Owner rationale | Issue |
|---|---|---|---|
| DR-001 | `<state>` | `<why>` | `<link or —>` |

## Accepted work

List only accepted actions. Keep analysis in this report and implementation in
GitHub issues.

- [ ] `<action>` — Source: DR-XXX — Issue: `<link>`

## Explicit limitations

State what the release judgement does **not** prove.

- `<for example: not yet field-validated on the Kungsleden>`

## What surprised us?

Capture insights rather than defects.

### Expected

`<prior assumption>`

### Review revealed

`<new insight>`

### Implication

`<how this should influence future decisions>`

## Final recommendation

Write the final judgement, supporting rationale, remaining conditions and next
review trigger.

## Follow-up review trigger

- `<date, release or real-world event that should initiate the next review>`
