# Spike: generate OpenAPI dari Valibot & routes

**Konteks:** Kontrak publish = [`openapi.yaml`](../openapi/openapi.yaml) (manual). Skema input = Valibot di `*.request.ts`. Risiko **drift** antara kode dan YAML.

**Gate saat ini:** `pnpm lint:openapi` (Spectral) — struktur OAS, `operationId` unik, tag terdefinisi.

---

## Opsi

| Opsi | Ringkas | Pro | Kontra |
|------|---------|-----|--------|
| **D1 — Build script** | Parser TS: scan `*.request.ts` + `*.routes.ts` → emit YAML | Dekat kode | Router/method/path sulit di-infer static; parser fragile |
| **D2 — Valibot → JSON Schema** | `@valibot/to-json-schema` per skema; path/method/auth tetap di YAML | Body request/response akurat | Path, security, contoh, `x-tagGroups` manual |
| **D3 — Manual + Spectral** | Proses dokumentasi + template; sync saat ubah API | Murah, sudah jalan | Drift tetap mungkin tanpa disiplin review |

---

## Rekomendasi

**D2 partial** jangka menengah, **D3** sebagai baseline:

1. **Tetap** maintain `docs/openapi/openapi.yaml` untuk path, method, tag, security, envelope, contoh.
2. **Opsional later:** script kecil yang dari export Valibot di `*.request.ts` generate fragmen `components/schemas` (JSON Schema) untuk merge/copy ke YAML — **bukan** full codegen path dari Router.
3. **Jangan** invest D1 full scan Router kecuali package knitto-http mengekspor metadata route (belum ada).

**Single source penuh** (D1) ditunda sampai ada kebutuhan produk (banyak endpoint / tim API-first terpisah).

---

## Checklist sync manual (D3)

Saat ubah HTTP:

- [ ] Path/method/tag/`operationId` di YAML selaras `*.routes.ts`
- [ ] Body/query selaras `*.request.ts` (atau schema hasil D2)
- [ ] Response envelope `{ message, result }` + error 4xx
- [ ] `pnpm lint:openapi` lulus
- [ ] Smoke Scalar: `OPENAPI_DOCS_ENABLED=true` → `/api-docs`

---

## Referensi

- Skill scaffold: [`.cursor/skills/feature-scaffold/SKILL.md`](../../.cursor/skills/feature-scaffold/SKILL.md)
- Registrasi Scalar: [`src/libs/config/register-open-api-docs.ts`](../../src/libs/config/register-open-api-docs.ts)
