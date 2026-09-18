---
name: feature-scaffold
description: >-
  Playbook scaffold dan ubah fitur HTTP untuk knitto-agent-feature.
  Checklist layer + snippet examples/; routing lewat orchestrator.mdc dan /feature.
---

# Feature scaffold (HTTP + domain layering)

Playbook scaffold — **standar layering & tanggung jawab tiap layer** ada di [`boilerplate.mdc`](../../rules/boilerplate.mdc) (§ Struktur Project, § Layer Responsibilities, § Decision Guide). Jangan duplikasi di sini.

**Contoh kode** ada di folder `examples/`.

## Kontrak use-case (ctx style)

Detail snippet: `examples/case.snippet.md`.

- **WAJIB** `req` di ctx — meski tidak dipakai langsung, untuk konsistensi dan akses context HTTP
- Field tambahan di ctx: DTO, userId, id transaksi, dll.
- **DILARANG** signature posisional `(conn, params)` atau `(tx, ...args)`
- **DILARANG** try-catch di use-case

## Checklist scaffold (fitur baru)

**Wajib (endpoint standar):**

- [ ] `{feature}.routes.ts` — default export `Router()`, `requestValidator`, `requestHandler`, controller
- [ ] `{feature}.request.ts` — skema Valibot + export tipe
- [ ] `{feature}.controller.ts` — `TRequestFunction`, panggil use-case/queries

**Kondisional:**

- [ ] `use-case/{verb}-{noun}.case.ts` — jika flow kompleks (ctx `{ req, ... }`)
- [ ] `repo/{feature}.repo.ts` — jika ada mutasi DB
- [ ] `queries/{feature}.queries.ts` — jika SELECT reusable
- [ ] `database/PB-x.x.x.sql` — jika perlu ubah schema (PB) → skill [`db-migration`](../db-migration/SKILL.md)
- [ ] `domain/{feature}.domain.ts` — jika ada aturan di luar skema request
- [ ] `service/{nama}.service.ts` — jika ada external API
- [ ] `helper/{feature}.helper.ts` — utility tanpa business logic
- [ ] `database/PB-….sql` atau migration prod — skill [`db-migration`](../db-migration/SKILL.md)

**Unit test (wajib agent saat scaffold):**

- [ ] `__tests__/domain/{feature}.domain.spec.ts` — jika ada domain
- [ ] `__tests__/helper/{feature}.helper.spec.ts` — jika ada helper
- [ ] Kontrak publish — jika endpoint/kontrak HTTP berubah dan docs dipakai: skill [`openapi-manual-sync`](../openapi-manual-sync/SKILL.md) (+ snippet `examples/`)
- [ ] **Keamanan** — jika endpoint butuh auth/guest, mutasi sensitif, PII, admin, atau external HTTP: baca [`security-owasp-minimal`](../security-owasp-minimal/SKILL.md) (+ checklist [`examples/checklist-endpoint.snippet.md`](../security-owasp-minimal/examples/checklist-endpoint.snippet.md))

Gunakan runner proyek (Jest). Mock queries/repo/service di integration test; domain/helper diuji tanpa DB.

## Perubahan fitur (bukan scaffold dari nol)

1. Identifikasi layer terdampak: routes → request → controller → case / queries / repo / domain / service
2. Jika kontrak input berubah — ubah `*.request.ts` dan `requestValidator` di routes **dulu**
3. Propagasi ke controller, case, queries, repo; jangan duplikasi validasi yang sudah di Valibot
4. Update atau tambah unit test domain/helper jika aturan bisnis berubah
5. Jika kontrak HTTP berubah — ikuti checklist [`openapi-manual-sync`](../openapi-manual-sync/SKILL.md) (kecuali **Skip OpenAPI** tercatat di plan/api-design)
6. Verifikasi: `pnpm build` + `pnpm test` untuk file terdampak

## Breaking change API

Jika path, method, body, atau bentuk response berubah untuk client eksternal:

- Catat dampak ke consumer API (frontend, service lain)
- Buat **TODO ke user** jika kontrak eksternal atau kebijakan versioning belum jelas
- Jangan asumsikan backward compatibility tanpa konfirmasi

Untuk refactor struktur tanpa ubah perilaku API → skill `refactor-layered`. Untuk bugfix saja → skill `debug-backend`.

## Pola routes

Lihat `examples/routes.snippet.md`.

## Endpoint file / streaming

Tidak semua endpoint cocok `TRequestFunction` + JSON. Untuk export CSV/PDF, attachment, streaming, multipart:

- Route: handler `(req, res)` dengan `ExpressType.Request` / `Response`
- Handler: ekstrak primitif dari `req`, panggil use-case dengan **ctx** `{ req, ... }`
- Contoh: `examples/express-raw-handler.snippet.md`

## Validasi: request vs domain

- **`*.request.ts`** — bentuk input (wajib/opsional, format, enum) via `requestValidator` di routes
- **Domain** — aturan lintas-field, invariant bisnis yang tidak tertutup skema. **Jangan duplikasi** validasi identik dengan Valibot

## Pola controller

1. Bangun konteks (user, session) di controller
2. Panggil domain hanya jika ada aturan di luar validator
3. **Baca:** query langsung atau `useCase({ req, ... })`
4. **Tulis:** repo atau use-case; transaksi di controller jika multi-write atomik
5. Return `{ message, result, statusCode? }`

## Snippet referensi

| File | Isi |
|------|-----|
| `examples/routes.snippet.md` | `Router()` + `requestHandler` + validator |
| `examples/request.snippet.md` | Valibot + `basicValidationMessage` |
| `examples/controller.snippet.md` | Simple read, complex write, transaksi multi-repo |
| `examples/case.snippet.md` | ctx style `{ req, ... }` |
| `examples/query.snippet.md` | SELECT di `queries/*.queries.ts` |
| `examples/repository.snippet.md` | `repo/*.repo.ts` + BaseRepository |
| `examples/domain.snippet.md` | Pure business rules |
| `examples/tests.snippet.md` | Unit test domain + helper |
| `examples/express-raw-handler.snippet.md` | File/streaming tanpa requestHandler |

## Fleksibilitas

| Kebutuhan | Tindakan |
|-----------|----------|
| Flow sederhana | Query langsung di controller, tanpa use-case |
| Multi-write atomik | Transaksi di controller — lihat `examples/controller.snippet.md` (§ multi-repo) |
| Tanpa repository | Mutasi sederhana via repo inline atau function di repo/ |
| Integrasi HTTP luar | `service/*.service.ts` |
| File/streaming | Handler Express mentah + use-case ctx `{ req, ... }` |
| Keputusan ambigu | Buat TODO untuk user — jangan tebak asumsi bisnis |

## Wire-up

Routes terdaftar otomatis dari `src/app/http/` via `@knittotextile/knitto-http` auto-routing (kecuali folder dikecualikan di `httpServer`). File `*.routes.ts` export **default** instance `Router()` — lihat `examples/routes.snippet.md`.

**Layering standar:** ctx use-case, `queries/`, `repo/`, `*.case.ts`. Migrasi struktur lama (`*.repository.ts` flat, `*.use-case.ts`) → skill `refactor-layered`.

## Larangan

- Jangan duplikasi validasi domain yang sudah di `*.request.ts`
- Jangan SQL panjang di controller
- Jangan try-catch di use-case, domain, queries, repo, helper
- Jangan use-case tanpa `req` di ctx
- Jangan `use-cases/` (plural) — pakai `use-case/`
- Jangan `*.use-case.ts` — pakai `*.case.ts`
- Jangan `*.repository.ts` flat — pakai `repo/*.repo.ts`
- Jangan `queries/*.query.ts` — pakai `queries/*.queries.ts`

## Setelah generate

1. `pnpm build` atau `tsc --noEmit`
2. Jalankan unit test domain/helper yang dibuat
3. Pastikan routes export default `Router()` + `requestHandler` (bukan `express.Router` langsung)
4. Jika `openapi.yaml` diubah: `pnpm lint:openapi`
