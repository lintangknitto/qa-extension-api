---
name: dependency-upgrade
description: >-
  Playbook bump dependency untuk knitto-agent-upgrade.
  Routing lewat orchestrator.mdc dan /upgrade.
---

# Dependency upgrade

Playbook naik versi package. **API reference setelah upgrade:** baca ulang `node_modules/@knittotextile/<pkg>/README.md` — itu sumber kebenaran, bukan duplikasi di rules.

## Package prioritas

**Knitto (utama):**

- `@knittotextile/knitto-http`
- `@knittotextile/knitto-core-backend`
- `@knittotextile/knitto-mysql`
- `@knittotextile/knitto-rabbitmq`

**Pendukung:** `valibot`, `typescript`, `jest`, `tsx`, dan deps langsung yang error setelah bump.

## Alur wajib

1. **Tentukan target versi** — patch/minor vs major; major butuh persetujuan user
2. **Baca breaking changes** — README di `node_modules` setelah install, atau changelog GitHub package
3. **Update** `package.json` → `pnpm install`
4. **Verifikasi build:** `pnpm build`
5. **Verifikasi test:** `pnpm test`
6. **Lint:** `pnpm lint` bila ada perubahan luas
7. **Fix compile/runtime** — sesuaikan import, API rename, validator syntax, RabbitMQ init, dll.

## Checkpoint proyek setelah upgrade `@knittotextile/*`

Pastikan masih compile dan pola init valid:

| File                                  | Yang dicek                                                            |
| ------------------------------------- | --------------------------------------------------------------------- |
| `src/index.ts`                        | `mysqlConnection.init()`, `rabbitConnection.init()`, startup flow     |
| `src/app/http/index.ts`               | `ExpressServer`, auto-routing, middleware                             |
| `src/libs/config/rabbitConnection.ts` | Singleton RabbitMQ                                                    |
| `src/app/messageBroker/index.ts`      | `subscribe()` path `src/app/messageBroker/consumers/` dengan pattern `**/*.consumer.ts` |
| `src/app/messageBroker/consumers/<domain>/` | `*.consumer.ts` + `*.handler.ts` + `*.request.ts` (v2) |

## Rules setelah upgrade

- Update rule tipis (`knitto-*.mdc`) **hanya** jika konvensi proyek atau path entry point berubah
- **Jangan** salin ulang API README ke rules — tetap pointer ke `node_modules`

## Larangan

- Jangan bump **major** tanpa konfirmasi user
- Jangan refactor fitur atau migrasi layering sekaligus (→ `refactor-layered` terpisah)
- Jangan ubah kontrak API sebagai efek samping upgrade (→ `feature-scaffold` jika API harus disesuaikan)

## Skill terkait

| Situasi                                        | Skill              |
| ---------------------------------------------- | ------------------ |
| Error logic setelah upgrade bukan breaking API | `debug-backend`    |
| Sekalian migrasi struktur ke standar           | `refactor-layered` |
