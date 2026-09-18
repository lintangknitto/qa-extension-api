---
name: openapi-manual-sync
description: >-
  Playbook sync manual docs/openapi/openapi.yaml saat kontrak HTTP berubah;
  untuk knitto-agent-feature dan knitto-agent-reviewer; routing lewat orchestrator /feature.
---

# OpenAPI manual sync

Playbook menjaga kontrak publish [`docs/openapi/openapi.yaml`](../../../docs/openapi/openapi.yaml) selaras dengan kode HTTP — **maintained manual** (bukan codegen dari Valibot). Scalar UI: [`register-open-api-docs.ts`](../../../src/libs/config/register-open-api-docs.ts) (mount `/api-docs`, spec `/api-docs/openapi.yaml`).

**Scaffold layer HTTP:** [`feature-scaffold`](../feature-scaffold/SKILL.md). **Standar layering:** [`boilerplate.mdc`](../../rules/boilerplate.mdc). **Snippet YAML:** [`examples/`](./examples/).

## Subagent

| Subagent | Peran |
| -------- | ----- |
| **`knitto-agent-feature`** | Utama — tambah/ubah operasi di YAML saat kontrak HTTP berubah |
| **`knitto-agent-reviewer`** | Bandingkan diff routes/request dengan YAML + `api-design.md` |

## Kapan sync OpenAPI

- Endpoint **baru** (path + method)
- Ubah **path**, **method**, **request body**, **query**, atau **bentuk response**
- Modul/tag **baru** di `src/app/http/{modul}` (perlu `tags:` + `x-tagGroups`)
- Consumer **eksternal** (frontend, service lain) mengandalkan docs publish

## Kapan skip (documented)

Catat eksplisit di **`plan.md`** dan/atau **`api-design.md`** — reviewer **hormati** skip (note, bukan blocker):

- Endpoint **internal-only** tanpa kebutuhan docs publish
- OpenAPI/docs **dimatikan permanen** di environment target
- Task hanya refactor struktur **tanpa** ubah kontrak HTTP (perilaku API sama)

Format disarankan di `api-design.md`:

```markdown
## OpenAPI publish

**Skip OpenAPI** — {alasan singkat}
```

Atau daftar endpoint wajib masuk YAML (lihat [`dev-plan-api`](../dev-plan-api/SKILL.md)).

## Checklist sync

- [ ] **Path + method** selaras dengan `*.routes.ts` (prefix auto-routing `src/app/http/`)
- [ ] **`operationId`** unik di seluruh spec
- [ ] **`tags`**: satu tag utama per operasi = nama folder modul (`home`, `auth`, …)
- [ ] **`x-tagGroups`**: grup sidebar Scalar selaras modul baru (lihat snippet)
- [ ] **Request body** selaras skema Valibot di `*.request.ts`
- [ ] **Response 200**: envelope `{ message, result }` — reuse `KnittoSuccessEnvelope` + `allOf` jika `result` tiped
- [ ] **Error 4xx** (400 validasi, 401 auth, 404 not found) dengan `KnittoErrorEnvelope` bila relevan
- [ ] **`security`**: `bearerAuth` jika route butuh JWT (selain guest path)
- [ ] **Example** `result`: gunakan `{}` atau objek — **hindari** `null` di contoh sukses/error standar

## Gate: lint Spectral

```bash
pnpm lint:openapi
```

Rules: [`docs/openapi/.spectral.yaml`](../../../docs/openapi/.spectral.yaml). Jalankan **setiap** kali `openapi.yaml` (atau file terkait di folder tersebut) berubah.

## Smoke docs (opsional dev)

1. Set `OPENAPI_DOCS_ENABLED=true` di `.env`
2. `pnpm dev` → buka `/api-docs`
3. Cek operasi, tag group, contoh request/response

**Ops Scalar (bukan per-endpoint):** flag env, guest path di [`guestPathHttp.ts`](../../../src/libs/config/guestPathHttp.ts), registrasi di [`register-open-api-docs.ts`](../../../src/libs/config/register-open-api-docs.ts) — jangan duplikasi full config di skill ini.

## Codegen / masa depan

Spike D2 (belum produksi): [`docs/internal/openapi-codegen-spike.md`](../../../docs/internal/openapi-codegen-spike.md). **Tetap manual full path** sampai keputusan tim.

## Skill terkait

| Situasi | Skill |
| ------- | ----- |
| Scaffold routes/request/controller | [`feature-scaffold`](../feature-scaffold/SKILL.md) |
| Plan § OpenAPI publish / skip | [`dev-plan-api`](../dev-plan-api/SKILL.md) |
| Review drift kontrak | [`pr-review-knitto`](../pr-review-knitto/SKILL.md) |

## Larangan

- Jangan mengandalkan JSDoc/swagger inline di routes sebagai kontrak publish
- Jangan ubah `openapi.yaml` tanpa selaras kode (atau sebaliknya) kecuali skip documented
- Jangan duplikasi full isi `register-open-api-docs.ts` di setiap task endpoint
