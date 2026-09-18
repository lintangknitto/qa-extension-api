---
name: security-owasp-minimal
description: >-
  Playbook audit keamanan minimal OWASP API Top 10 (2023) untuk backend Knitto.
  Dipakai knitto-agent-security, feature, reviewer; kontrak tipis di knitto-security.mdc.
---

# Keamanan minimal OWASP (API)

Playbook review dan hardening **implementasi** backend — bukan pengganti audit penuh, SAST enterprise, atau compliance (PCI/HIPAA). Selaras [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/).

**Kontrak proyek (tipis):** [`knitto-security.mdc`](../../rules/knitto-security.mdc). **Layering HTTP:** [`boilerplate.mdc`](../../rules/boilerplate.mdc).

## Subagent & pemakai

| Subagent / fase | Peran |
| --------------- | ----- |
| **`knitto-agent-security`** | Audit readonly default; remediasi hanya jika user minta eksplisit |
| **`knitto-agent-feature`** | Checklist saat endpoint auth/guest/mutasi sensitif/external service |
| **`knitto-agent-reviewer`** | Subset blocker kritis di PR review → `blockers` / `notes` |
| **`knitto-agent-planner`** | Section Keamanan di `api-design.md` (skill [`dev-plan-api`](../dev-plan-api/SKILL.md)) |

Slash command IDE: `/security` → [`commands/security.md`](../../commands/security.md).

## Mapping OWASP API Top 10 → Knitto

| ID | Fokus review implementasi |
| --- | --- |
| **API1** BOLA | ID/resource di path/body: otorisasi di controller/use-case — user hanya akses miliknya |
| **API2** Broken auth | JWT via [`authorization.middleware.ts`](../../../src/libs/middlewares/authorization.middleware.ts); guest path eksplisit di [`guestPathHttp.ts`](../../../src/libs/config/guestPathHttp.ts) |
| **API3** Property exposure | Response tidak expose field internal; whitelist di domain/controller. Stack/detail error: posture audience **tingkat repository** (PRD / `api-design.md` § Keamanan) — redaksi disarankan bila repo publik/eksternal; internal-only bukan blocker universal ([`knitto-security.mdc`](../../rules/knitto-security.mdc), [`dev-plan-api`](../dev-plan-api/SKILL.md)) |
| **API4** Resource consumption | List: pagination (`basicPaginate` / knitto-http); batasi payload Valibot |
| **API5** BFLA | Endpoint admin/sensitive: cek role/permission (jika ada di PRD/plan) |
| **API6** Unrestricted flow | Mutasi kritikal: idempotency middleware global — pastikan dipakai bila perlu |
| **API7** SSRF | Panggilan HTTP keluar di `service/*.service.ts`; validasi URL/host bila user-controlled |
| **API8** Misconfig | Default `APP_SECRET_KEY`, guest path terlalu luas (`withSubPath`), CORS/env |
| **API9** Inventory | OpenAPI + guest path selaras kontrak publish |
| **API10** Unsafe consumption | Validasi response external sebelum dipakai downstream |

## Severity (review & audit)

### Blocker (pipeline PR & audit kritis)

Masukkan ke **`blockers`** di `review.json` (reviewer) atau daftar finding **Critical/Blocker** (agent security):

- Risiko **SQL injection** (concat user input ke SQL)
- **Auth bypass** — route sensitif tanpa JWT / guest path salah
- **Hardcoded secret** (API key, password, private key di kode)
- Guest path **terlalu luas** (`withSubPath` tanpa justifikasi) membuka area sensitif
- **Logging credential** (token/password/body auth)

### Note (non-blocking)

Masukkan ke **`notes`**:

- List besar tanpa pagination
- Rate limit belum ada di boilerplate
- `pnpm audit` dependency (opsional, kebijakan tim)
- Stack trace / detail DB di response error — **note**, bukan blocker PR, bila posture repo **internal-only** (terdokumentasi); untuk repo **publik/eksternal** masukkan rekomendasi redaksi di `notes` (bukan keputusan ad hoc per endpoint)

## Checklist endpoint baru

Snippet lengkap: [`examples/checklist-endpoint.snippet.md`](./examples/checklist-endpoint.snippet.md).

Ringkas:

- [ ] Auth: protected vs guest — guest hanya via `guestPathHttp.ts` bila memang publik
- [ ] Valibot membatasi tipe/ukuran input
- [ ] Otorisasi resource (API1/API5) di controller atau use-case
- [ ] SELECT/mutasi parameterized; tidak concat SQL
- [ ] Response tidak bocorkan field DB internal di `result` (API3); redaksi stack/detail error sesuai **posture audience repo** (bukan ad hoc per endpoint) — [`knitto-security.mdc`](../../rules/knitto-security.mdc), § Keamanan [`dev-plan-api`](../dev-plan-api/SKILL.md)
- [ ] External call di `service/` dengan validasi URL jika perlu
- [ ] OpenAPI/guest selaras bila kontrak dipublish

## Alur audit (knitto-agent-security)

1. Tentukan scope (diff, branch, modul, file)
2. Baca kontrak [`knitto-security.mdc`](../../rules/knitto-security.mdc)
3. Bandingkan kode terdampak dengan mapping OWASP di atas
4. **Default:** laporan finding — severity, file, rekomendasi (tanpa edit)
5. **Fix mode** (user minta perbaiki/remediasi): diff minimal, `pnpm build` + `pnpm test`; tidak refactor luas

## Verifikasi manual

- Review diff/modul terhadap checklist
- Opsional: `pnpm audit` (non-blocking kecuali kebijakan tim)

## Snippet

| File | Isi |
| ---- | --- |
| [`examples/checklist-endpoint.snippet.md`](./examples/checklist-endpoint.snippet.md) | Checklist per endpoint |
| [`examples/sql-parameterized.snippet.md`](./examples/sql-parameterized.snippet.md) | Anti-pattern vs parameterized |
| [`examples/guest-path.snippet.md`](./examples/guest-path.snippet.md) | Menambah guest path dengan aman |

## Larangan agent security

- Jangan ubah kontrak API breaking tanpa konfirmasi user
- Jangan refactor struktur luas (→ `knitto-agent-refactor`)
- Bug runtime/regresi setelah fix — user bisa arahkan `/fix` ke debugger
