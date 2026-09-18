---
name: debug-backend
description: >-
  Playbook investigasi dan fix bug untuk knitto-agent-debugger.
  Routing intent user lewat orchestrator.mdc dan /fix — bukan pengganti delegasi root.
---

# Debug backend

Playbook investigasi dan perbaikan bug. **Standar arsitektur:** [`boilerplate.mdc`](../../rules/boilerplate.mdc). **API library:** README di `node_modules/@knittotextile/*/README.md`.

## Alur wajib

1. **Reproduksi / baca error** — stack trace, status HTTP, pesan exception, log Pino (`logger.error`)
2. **Batasi scope** — lacak call chain: routes → controller → case / queries / repo / domain / service
3. **Hipotesis → bukti** — baca kode dan data; jangan tebak root cause
4. **Fix minimal** — satu root cause per perubahan; hindari refactor lebar
5. **Verifikasi** — `pnpm build`, `pnpm test` (file/test terkait), uji endpoint manual bila perlu

## Pointer proyek

| Area | Lokasi |
|------|--------|
| HTTP server | `src/app/http/index.ts` |
| Routes & controller | `src/app/http/**` |
| MySQL | `src/libs/config/mysqlConnection.ts` |
| RabbitMQ | `src/libs/config/rabbitConnection.ts`, `src/app/messageBroker/` |
| Auth bypass | `src/libs/config/guestPathHttp.ts` |
| Exception classes | `node_modules/@knittotextile/knitto-core-backend/README.md` |

## Larangan saat debug

- Jangan refactor besar atau migrasi struktur (→ skill `refactor-layered`)
- Jangan ubah kontrak API (path, body, response) tanpa konfirmasi user (→ skill `feature-scaffold` § Breaking change)
- Jangan try-catch di domain, queries, repo, case, helper — kecuali transaksi di controller
- Jangan tambah fitur di luar scope perbaikan bug

## Output ke user

Setelah fix, sampaikan ringkas:

- **Root cause** — apa yang salah dan mengapa
- **File diubah** — daftar path
- **Cara verifikasi** — command test atau langkah manual

## Skill terkait

| Situasi | Skill |
|---------|-------|
| Perlu ubah perilaku/fitur API | `feature-scaffold` |
| Perlu rapikan struktur tanpa ubah API | `refactor-layered` |
| Error muncul setelah bump package | `dependency-upgrade` |
