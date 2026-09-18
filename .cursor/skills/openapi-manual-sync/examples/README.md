# Contoh skill `openapi-manual-sync`

Snippet YAML untuk sync manual [`docs/openapi/openapi.yaml`](../../../../docs/openapi/openapi.yaml).

| File | Isi |
|------|-----|
| `operation.snippet.md` | GET/POST: tags, operationId, 200 + 400/401, example `result: {}` |
| `tag-groups.snippet.md` | `tags:` + `x-tagGroups` selaras folder `src/app/http/{modul}` |
| `schemas-envelope.snippet.md` | `KnittoSuccessEnvelope`, request/result, `allOf` |

Playbook lengkap: [`../SKILL.md`](../SKILL.md). Lint: `pnpm lint:openapi`.
