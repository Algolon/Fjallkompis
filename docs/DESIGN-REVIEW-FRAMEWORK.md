# Fjällkompis design review framework

## Purpose

This framework defines how Fjällkompis is reviewed before meaningful releases,
field use and major product changes. It standardises the review process without
automating judgement or conclusions.

Every initiated review must produce a concrete, readable report in
[`docs/design-reviews/`](design-reviews/). Reviews are deliberate events, not
background checks, scheduled bots or automatically generated scorecards.

The framework protects Fjällkompis from three failure modes:

1. accumulating unstructured opinions instead of evidence;
2. expanding into a generic outdoor platform without an explicit decision;
3. polishing minor visual details before addressing trust, task completion or
   field usability.

## Product authority

Fjällkompis is an **offline hiking companion for the Kungsleden between Abisko
and Nikkaluokta**. It complements suitable maps, navigation tools and outdoor
judgement by bringing route-specific information into one bounded,
offline-first experience.

Design reviews must evaluate changes against that identity. A recommendation
that broadens the product beyond this scope is not automatically wrong, but it
must be identified as a product-direction decision rather than treated as an
ordinary usability fix.

## Framework, Design Authority and review report

- **Framework** — this document: the reusable method.
- **Design Authority** — the set of review lenses and the human decision process
  used to interpret findings.
- **Review report** — the concrete written output for one initiated review.
- **GitHub issue** — implementation work created only after a finding is
  accepted.

The Design Authority may use AI-assisted analysis, but AI simulation is not a
substitute for field evidence, external research or real users. Every finding
must state its evidence class and confidence.

## Review principles

### 1. Trail consequence before interface convention

Every recommendation must explain why it matters before, during or after a
hike. Cosmetic improvements are valid, but must be labelled as polish rather
than presented as safety or usability findings.

### 2. Evidence before certainty

Findings distinguish observation from inference, simulation and external
validation. Uncertainty is recorded explicitly.

### 3. Product identity before feature expansion

Reviews improve the current companion first. New-platform, multi-trail,
commercial or growth ideas are separated from release-readiness findings.

### 4. Field reality outranks simulation

Real Kungsleden observations override pre-field assumptions where they conflict.
The report should preserve both so the learning remains visible.

### 5. Findings are not automatically backlog items

Every recommendation is triaged as accepted, revised, deferred, rejected or
needing evidence before an issue is created.

### 6. The process is repeatable; the conclusion is not automated

Templates, lenses and classifications are reusable. Scores, priorities,
release judgements and decisions require an initiated review and a concrete
written rationale.

## Design Authority lenses

A full review uses the following lenses. Focused reviews may use a subset, but
must explain why.

### A. First-time user

**Question:** Can someone understand what Fjällkompis is, where they are and
what they should do next without prior instruction?

Examines terminology, onboarding, navigation, discoverability, state clarity,
error recovery and first-use expectations.

### B. Experienced hiker

**Question:** Does the companion support a realistic hiking workflow without
creating false confidence or unnecessary distraction?

Examines preparation, relevance of trail information, battery-aware behaviour,
backup expectations, morning/walking/arrival/evening use and missing versus
unnecessary information.

Until supported by real trail evidence, this lens is explicitly a simulated
expert perspective.

### C. Field simulation reviewer

**Question:** What happens when the whole experience is used under realistic
conditions rather than inspected screen by screen?

Typical scenarios include:

- preparation at home on Wi-Fi;
- installation and offline download;
- reopening in airplane mode;
- waking in a hut and checking the day;
- rain, glare, gloves, fatigue and one-handed use;
- low battery and intermittent attention;
- uncertain GPS or possible off-route state;
- changing the current stage;
- arriving tired at a hut;
- recovering after an update or restart.

### D. Interaction and information architecture

**Question:** Does the product minimise cognitive and physical effort while
preserving control?

Examines task flows, hierarchy, state transitions, navigation persistence,
progressive disclosure, consistency, error prevention and recovery.

### E. Visual interface

**Question:** Does the visual system communicate importance, status and
interaction consistently?

Examines typography, spacing, colour, contrast hierarchy, iconography, density,
visual rhythm, component consistency and cross-device coherence.

### F. Accessibility and outdoor usability

**Question:** Can the interface still be perceived and operated under
constrained conditions?

Examines semantic accessibility, keyboard and screen-reader support, focus,
reduced motion, contrast, text size, touch targets, sunlight, gloves, wet
conditions, fatigue, one-handed use and battery-saving display modes.

### G. Product strategy

**Question:** Is every capability earning its place and reinforcing the product
identity?

Examines scope discipline, positioning, redundancy, premature generalisation,
roadmap implications and what should be removed, deferred or explicitly kept
out of scope.

### H. Systems and software integrity

**Question:** Are behaviour, architecture, data and operational assumptions
coherent and resilient?

Examines state ownership, offline degradation, persistence boundaries, update
behaviour, error states, maintainability, performance, dependency risk, data
freshness, test coverage, modularity and failure propagation.

## Evidence classes

Every finding uses one evidence class:

- **Observed** — directly visible in the interface, code, test result or
  documented behaviour.
- **Derived** — logically inferred from observed design or architecture.
- **Simulated** — surfaced through a field scenario or review lens.
- **Externally validated** — supported by real users, field evidence,
  authoritative guidance or standards.
- **Unvalidated hypothesis** — plausible but requiring further evidence.

## Confidence

- **High** — directly observed or strongly corroborated.
- **Medium** — credible inference with limited uncertainty.
- **Low** — exploratory hypothesis or simulation requiring validation.

## Severity and priority

Severity describes impact; priority describes timing. They must not be merged.

### Severity

- **Critical** — potential safety, data-loss or major trust failure.
- **High** — blocks or seriously distorts an important task.
- **Medium** — recurring confusion, friction or inefficiency.
- **Low** — minor inconsistency or polish issue.

### Priority

- **P0 — Before field use**
- **P1 — Before the next meaningful release**
- **P2 — Valuable follow-up**
- **P3 — Backlog or monitor**
- **No action**

## Decision states

Each finding ends in one of these states:

- **Accepted** — convert into implementation work.
- **Accepted with revision** — principle accepted, recommendation changed.
- **Needs evidence** — retain as an open validation question.
- **Deferred** — valid but intentionally postponed.
- **Rejected** — not aligned, unsupported or not worth the trade-off.
- **Superseded** — replaced by another finding or later evidence.

## Review types

### Full review

Use before:

- personal field deployment;
- a major release such as 1.0;
- adapting the framework to another trail;
- major navigation or information-architecture changes.

A full review uses all Design Authority lenses and produces a complete report.

### Focused review

Use for a bounded area such as Map, Trail readiness, offline behaviour,
accessibility or a major visual redesign. The report lists included and omitted
lenses.

### Lightweight change check

Ordinary PRs do not need a full report. They should still answer:

1. Which user or field scenario changes?
2. Which existing design decision is affected?
3. Does the change add a failure state?
4. Does it preserve product boundaries?
5. What evidence verifies the result?

## Review lifecycle

1. **Initiate** — name the review, objective, version, commit and scope.
2. **Establish evidence** — collect screenshots, live build, known limitations,
   relevant code/tests and prior decisions.
3. **First-use walkthrough** — evaluate the companion without relying on
   project knowledge.
4. **Field simulation** — run realistic preparation, hiking and failure
   scenarios.
5. **Specialist passes** — apply the selected Design Authority lenses.
6. **Synthesis** — consolidate duplicate symptoms into systemic findings.
7. **Triage** — record owner decisions, trade-offs and evidence gaps.
8. **Execution** — create GitHub issues only for accepted work, linking the
   report finding ID.
9. **Release judgement** — publish an explicit conclusion and limitations.
10. **Archive** — add the report to the review index.

## Review finding format

```markdown
### DR-XXX — Finding title

**Lens:** First-time user · Accessibility/outdoor usability  
**Area:** Settings → Trail readiness  
**Evidence:** Observed  
**Severity:** High  
**Priority:** P0  
**Confidence:** High  
**Decision:** Needs evidence

**Observation**  
What was seen or inferred.

**Why it matters on the trail**  
The practical consequence.

**Affected scenario**  
Where and when it appears.

**Recommendation**  
The proposed change or validation step.

**Trade-offs**  
What is lost, complicated or deferred.

**Validation**  
How the recommendation can be checked.
```

Finding IDs are unique within a report. GitHub issues created from findings
must link back to the report and ID.

## Release judgements

Every full review ends with one of these judgements:

- **Not ready for personal field use**
- **Ready with blockers**
- **Ready with explicit limitations**
- **Ready for intended use**
- **Field-validated**

A pre-trip review cannot honestly conclude **Field-validated**.

## Required report output

Every initiated full or focused review produces a readable Markdown report
using the repository template. It must include:

- executive summary;
- scope and evidence baseline;
- visual review dashboard with qualitative ratings and rationale;
- findings by review lens;
- field simulation;
- cross-review synthesis;
- finding catalogue;
- decisions and accepted work;
- final release judgement;
- explicit limitations;
- “What surprised us?” reflection.

The dashboard is a communication aid, not an automated quality score. Any
rating must be accompanied by written reasoning.

## Relationship to other documents

- [`README.md`](../README.md) — what Fjällkompis is and how to use it.
- [`ROADMAP.md`](../ROADMAP.md) — what is prioritised next.
- [`CHANGELOG.md`](../CHANGELOG.md) — what has been delivered.
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — how the system is built and
  maintained.
- [`docs/design-reviews/`](design-reviews/) — concrete review reports and their
  index.
- GitHub issues — accepted implementation work.
