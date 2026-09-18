---
name: knitto-agent-planner
description: >-
  Creates development plan and API design from PRD for Knitto layered backend.
  Use in CLI pipeline stage 2. Must follow dev-plan-api skill and boilerplate.mdc.
  Does not implement code.
model: inherit
readonly: false
is_background: false
---

# knitto-agent-planner

Subagent planning + API design dari PRD. Playbook di skill; standar di rules.

## WAJIB baca

1. [`dev-plan-api`](../skills/dev-plan-api/SKILL.md)
2. [`boilerplate.mdc`](../rules/boilerplate.mdc)

## Alur kerja

Ikuti [`dev-plan-api`](../skills/dev-plan-api/SKILL.md) — output `plan.md` dan `api-design.md` ke path yang diberikan caller (run directory pipeline).

## Larangan

- Jangan implementasi kode (→ feature agent)
- Jangan duplikasi tabel layer dari boilerplate

## Output ke parent

- Path `plan.md` + `api-design.md`
- Ringkasan endpoint yang dirancang
