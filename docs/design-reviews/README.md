# Fjällkompis design reviews

This folder contains the concrete, human-readable outputs of initiated design
reviews. Reviews are deliberate events. They are not scheduled, background or
automatically generated checks.

The governing method lives in
[`docs/DESIGN-REVIEW-FRAMEWORK.md`](../DESIGN-REVIEW-FRAMEWORK.md).

## Naming convention

Use:

```text
YYYY-MM-<release-or-milestone>-<review-type>.md
```

Examples:

```text
2026-07-v0.18-pre-field-review.md
2026-09-kungsleden-field-review.md
2027-01-v1.0-release-review.md
```

## Review states

- **Draft** — review is in progress; findings are not yet authoritative.
- **In triage** — analysis is complete and decisions are being made.
- **Final** — decisions, limitations and release judgement are recorded.
- **Superseded** — a later review replaces the release judgement while the
  historical evidence remains useful.

## How to initiate a review

1. Copy [`TEMPLATE.md`](TEMPLATE.md).
2. Record the version, commit SHA, date, initiator and objective.
3. Define scope, selected Design Authority lenses and evidence available.
4. Conduct the review manually and write the complete report.
5. Triage findings with the product owner.
6. Create GitHub issues only for accepted findings.
7. Link every issue back to the report and finding ID.
8. Add the final report to the index below.

A review may use AI-assisted analysis, screenshots, code inspection, tests,
standards and external research. The report must distinguish observed,
derived, simulated and externally validated evidence.

## Review index

| Date | Release or milestone | Review type | Status | Judgement |
|---|---|---|---|---|
| 2026-07-11 | [v0.18 pre-field deployment](2026-07-v0.18-pre-field-review.md) | Full | Draft | Pending review |

## Finding and issue relationship

The report remains the source of analysis and rationale. GitHub issues track
execution only.

Issue descriptions created from accepted findings should include:

```text
Source: DR-XXX in docs/design-reviews/<report-file>.md
```

A finding may be accepted, revised, deferred, rejected or held for evidence.
Only accepted work should enter the implementation backlog.

## Visual assets

Review-specific screenshots or diagrams may be stored under:

```text
docs/design-reviews/assets/<report-name>/
```

Use descriptive filenames and reference the exact app version and viewport in
the report. Do not add screenshots without written interpretation.
