# ADR 0001 — Adopt a Design Authority for product reviews

- **Status:** Accepted
- **Date:** 2026-07-11
- **Decision owners:** Omar van der Heijden and the Fjällkompis review process

## Context

Fjällkompis has matured from an exploratory personal project into an offline
hiking companion intended for real use on the Kungsleden. Product decisions
now span interaction design, visual design, accessibility, field usability,
product scope, architecture and operational trust.

Ad hoc critique, broad beta feedback and isolated implementation reviews do not
provide a consistent way to judge whether the companion is ready for intended
use. They also risk turning individual opinions into backlog items without
clear evidence, consequence or product-boundary checks.

The project needs a repeatable review method while preserving deliberate human
judgement. Reviews must produce concrete readable outputs, but must not run as
scheduled or automated quality verdicts.

## Decision

Adopt the
[`Fjällkompis design review framework`](../DESIGN-REVIEW-FRAMEWORK.md) as the
governing product-review methodology.

Within that framework:

- the **Framework** defines the reusable process;
- the **Design Authority** is the panel of review lenses and the owner-led
  decision process;
- every initiated full or focused review creates a written report under
  [`docs/design-reviews/`](../design-reviews/);
- AI-assisted review may inform findings but must distinguish observed,
  derived, simulated and externally validated evidence;
- field evidence outranks simulation;
- findings are triaged before implementation;
- GitHub issues are created only for accepted work and link back to the source
  finding;
- review conclusions are never generated automatically or on a schedule.

## Consequences

### Positive

- Product quality is evaluated consistently across releases.
- Safety, trust and field usability are separated from cosmetic polish.
- Decisions retain their evidence, trade-offs and rationale.
- The project can compare pre-field assumptions with real Kungsleden findings.
- Future contributors can understand why a recommendation was accepted,
  deferred or rejected.
- The method can later support another trail without prematurely generalising
  the current product.

### Costs and constraints

- Full reviews require deliberate time and judgement.
- Reports must be maintained as readable records.
- Qualitative ratings remain communication aids rather than objective metrics.
- Simulated hiker perspectives cannot be treated as field validation.
- Not every code or design change warrants a full review.

## Alternatives considered

### Rely on broad external beta feedback

Rejected as the primary method. External feedback remains useful, but response
quality, context and relevance vary, and early broad testing may not change the
current personal-use decisions.

### Automate a design score or scheduled review

Rejected. Automated checks can verify technical properties, but cannot make a
credible judgement about field trust, cognitive load, product boundaries or
release readiness.

### Keep reviews only in conversations or issues

Rejected. Conversation history and implementation tickets do not provide a
stable, consolidated review record or preserve rejected and deferred findings.

## Follow-up

The first full report should be a manually initiated **v0.18 pre-field review**
created from [`docs/design-reviews/TEMPLATE.md`](../design-reviews/TEMPLATE.md).
It should remain separate from this foundation change so the methodology can be
reviewed before it governs the first assessment.
