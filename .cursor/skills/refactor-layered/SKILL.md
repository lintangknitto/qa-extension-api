---
name: refactor-layered
description: >-
  Playbook refactor layering untuk knitto-agent-refactor.
  Routing lewat orchestrator.mdc dan /refactor.
---

# Refactor layered

Playbook refactor ke standar layering **tanpa mengubah perilaku eksternal** (kontrak API & outcome bisnis sama), kecuali user explicitly minta perubahan.

**Standar:** [`boilerplate.mdc`](../../rules/boilerplate.mdc). **Target struktur & snippet:** [`feature-scaffold/examples/`](../feature-scaffold/examples/).

## Prasyarat

- Response HTTP, path, method, dan semantics bisnis **tetap sama** setelah refactor
- Ada baseline verifikasi: test existing atau checklist manual endpoint sebelum/sesudah
- Refactor per modul atau endpoint — langkah kecil, verifikasi tiap langkah

## Checklist migrasi legacy → standar

| Legacy (kode saat ini) | Target (rules) |
|------------------------|----------------|
| Route file tanpa default export `Router()` / tanpa `requestHandler` di chain JSON | Default export `Router()` + `requestHandler` / `requestValidator` — lihat `examples/routes.snippet.md` |
| `*.repository.ts` flat di root modul | `repo/*.repo.ts` — lihat `examples/repository.snippet.md` |
| `*.use-case.ts` atau `(tx, ...args)` posisional | `use-case/*.case.ts` dengan ctx `{ req, ... }` — lihat `examples/case.snippet.md` |
| SELECT inline di controller/use-case | `queries/*.queries.ts` bila reusable — snippet `feature-scaffold/examples/query.snippet.md` |
| Mutasi via fungsi / `mysqlConnection` langsung | Class `repo/*.repo.ts` + `extends BaseRepository` — snippet `feature-scaffold/examples/repository.snippet.md` |
| Validasi manual di controller | Skema Valibot di `*.request.ts` + `requestValidator` di routes |

## Strategi

1. Pilih satu modul/fitur (mis. `user-management/department/`)
2. Refactor layer terluar dulu (routes → request → controller) atau layer dalam (queries/repo/case) sesuai dependency
3. Jalankan `pnpm build` setelah setiap langkah logis
4. Jalankan `pnpm test` untuk modul terdampak
5. Jangan campur refactor dengan fitur baru — fitur baru → `feature-scaffold`

## Larangan

- Jangan ubah kontrak API sebagai "bagian refactor" tanpa persetujuan user
- Jangan duplikasi tabel layer di file ini — baca `boilerplate.mdc`
- Jangan fix bug sekaligus refactor besar — pisah: bug → `debug-backend`, struktur → skill ini

## Skill terkait

| Situasi | Skill |
|---------|-------|
| Tambah/ubah perilaku API | `feature-scaffold` |
| Fix bug tanpa ubah struktur | `debug-backend` |
| Bump package | `dependency-upgrade` |
