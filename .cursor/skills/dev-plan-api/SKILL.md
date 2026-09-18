---
name: dev-plan-api
description: >-
  Playbook plan.md dan api-design.md dari PRD untuk knitto-agent-planner.
  Dipakai pipeline server (stage-plan); bukan trigger delegasi root langsung.
---

# Dev plan & API design

Playbook planning dari PRD. **Standar layering:** [`boilerplate.mdc`](../../rules/boilerplate.mdc) — jangan duplikasi tabel layer di sini.

## Input

- PRD (`prd.md`)
- Konteks repo `src/app/http/**`

## Output 1: plan.md

```markdown
# Development plan

## Summary
{1 paragraf}

## Layers impacted
| Layer | File(s) | Action |
|-------|---------|--------|

## Implementation order
1. ...

## OpenAPI (jika kontrak HTTP baru/berubah)
- [ ] Sync [`docs/openapi/openapi.yaml`](../../../docs/openapi/openapi.yaml) per skill [`openapi-manual-sync`](../openapi-manual-sync/SKILL.md) + `pnpm lint:openapi`
- Atau tidak perlu jika `api-design.md` § **Skip OpenAPI** (catat alasan)

## Test plan
- Unit: domain/helper ...
- Integration: ...
- Manual: endpoint ...
```

## Output 2: api-design.md

```markdown
# API design

## Endpoints
### {METHOD} {path}
- Auth: ...
- Request (Valibot): ...
- Response 200: ...
- Errors: 400, 401, 404, ...

## Keamanan

- **Audience repo / API:** publik eksternal vs internal-only (posture default satu repo; endpoint campuran catat eksplisit di sini) — selaras redaksi error di [`knitto-security.mdc`](../../rules/knitto-security.mdc)
- Model auth per endpoint (JWT / guest / role)
- Guest vs protected — apakah perlu entry di `guestPathHttp.ts` (justifikasi jika `withSubPath`)
- Data sensitif di request/response (PII, credential) — whitelist field ke client
- External HTTP / URL user-controlled → `service/*.service.ts`, mitigasi SSRF
- Referensi checklist: skill [`security-owasp-minimal`](../security-owasp-minimal/SKILL.md)

## Database (jika ada)
- Tables / columns … — detail file migration (`database/PB-….sql`): skill [`db-migration`](../db-migration/SKILL.md); layer kode SELECT/mutasi per [`boilerplate.mdc`](../../rules/boilerplate.mdc)

## Message broker (jika ada)
- Routing key ...

## OpenAPI publish

Daftar endpoint yang **wajib** masuk [`docs/openapi/openapi.yaml`](../../../docs/openapi/openapi.yaml) (path, method, auth, skema utama), selaras § Endpoints di atas.

Atau:

**Skip OpenAPI** — {alasan: internal-only, docs off, dll.}

Reviewer dan dev stage **hormati** skip documented — bukan blocker drift.
```

## Aturan

- Default export `Router()` + Valibot + `TRequestFunction` + `requestHandler`
- Use-case: ctx `{ req, ... }`, file `use-case/*.case.ts`
- SELECT → queries/; mutasi → repo/
- Jangan ubah kontrak API di luar scope PRD tanpa catat open question
- OpenAPI: setiap task dengan endpoint baru/ubah kontrak — pastikan § OpenAPI publish atau Skip di `api-design.md` + item sync di `plan.md` bila tidak skip
