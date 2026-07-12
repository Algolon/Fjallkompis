# ADR 0002 — Add Creator Intent to the Design Authority

- **Status:** Accepted
- **Date:** 2026-07-11
- **Decision owner:** Omar van der Heijden

## Context

Fjällkompis is evolving through many small design and implementation decisions.
Although the product identity is documented, incremental improvements can still
shift emphasis, weaken earlier design choices or gradually move the companion
away from the experience it was intended to become.

The existing Design Authority reviews the product through user, field, design,
accessibility, strategy and systems lenses. Those perspectives can judge
quality and coherence, but they do not fully answer a separate ownership
question:

> Does the current implementation still fulfil the original design intent?

That question must remain visible throughout development rather than only being
revisited when product drift is already obvious.

## Decision

Add **Creator Intent** as the ninth Fjällkompis Design Authority lens.

Its governing question is:

> Does the current implementation still fulfil the intended product experience,
> and have incremental changes preserved or weakened the decisions that define
> Fjällkompis?

The lens examines:

- whether Today remains the operational hub for the hiking day;
- whether the companion continues to reduce cognitive load rather than merely
  accumulate capability;
- whether it remains a bounded offline hiking companion rather than drifting
  toward a generic outdoor platform;
- whether route-specific usefulness, offline trust and field clarity still
  dominate design decisions;
- whether later changes unintentionally contradict earlier accepted decisions;
- whether the current experience still reflects the product owner's intent;
- whether apparent improvements have introduced conceptual or experiential
  regressions.

Creator Intent is not a veto against change and is not a substitute for user or
field evidence. It exists to make drift explicit. Where creator intent conflicts
with observed user needs, safety, accessibility or field evidence, the conflict
must be documented and resolved through owner triage rather than hidden.

## Required review output

Full reviews must include:

1. Creator Intent as a selected Design Authority lens;
2. a dedicated written assessment;
3. explicit checks against the product identity and prior design decisions;
4. any identified drift, contradiction or preserved intent;
5. an owner decision where a recommendation would intentionally change the
   original direction.

Focused reviews should include the lens whenever the change affects product
identity, Today, navigation, scope, information hierarchy or the intended daily
hiking workflow.

## Consequences

### Positive

- Product intent stays visible during incremental development.
- Drift can be identified before it becomes embedded in architecture or UX.
- The review process distinguishes quality improvements from directional
  changes.
- The product owner retains an explicit voice alongside simulated and external
  perspectives.
- Future trail adaptations can separate transferable framework decisions from
  Fjällkompis-specific intent.

### Constraints

- Creator intent is partly subjective and must be stated transparently.
- It must not overrule safety, accessibility or field evidence by default.
- Historical intent may legitimately evolve; such evolution should be recorded
  as a conscious product decision.

## Applied immediately

Design Review #1 — v0.18 pre-field — includes Creator Intent as its ninth lens
and will assess whether the current product still supports the intended
Prepare → Walk → Arrive → Repeat rhythm, with Today as the operational centre.
