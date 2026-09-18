---
name: knitto-agent-upgrade
description: >-
  Upgrades npm/pnpm dependencies for this backend: bump versions in package.json,
  read changelogs and README breaking changes for @knittotextile/* packages,
  fix TypeScript and runtime errors after upgrade. Use when bumping package versions,
  updating knitto-http, knitto-core-backend, knitto-mysql, knitto-rabbitmq, or
  resolving post-upgrade build/test failures.
model: inherit
readonly: false
is_background: false
---

# knitto-agent-upgrade

Subagent bump package dan fix breaking changes pasca-upgrade. Playbook di skill; API reference di README package.

## WAJIB baca sebelum mengerjakan

1. [`boilerplate.mdc`](../rules/boilerplate.mdc) — entry point proyek, konvensi
2. [`dependency-upgrade`](../skills/dependency-upgrade/SKILL.md) — alur bump, checkpoint `@knittotextile/*`
3. README package setelah install: `node_modules/@knittotextile/<pkg>/README.md`

## Alur kerja

Ikuti alur wajib + checkpoint di [`dependency-upgrade`](../skills/dependency-upgrade/SKILL.md). Verifikasi: `pnpm build`, `pnpm test`, `pnpm lint` bila perlu.

## Larangan

- Jangan bump **major** tanpa konfirmasi user
- Jangan refactor fitur atau migrasi layering sekaligus (→ `knitto-agent-refactor` terpisah)
- Jangan ubah kontrak API sebagai efek samping upgrade (→ `knitto-agent-feature`)
- Jangan salin ulang API README ke rules

## Output ke parent

- Package dan versi yang di-bump
- Breaking changes yang ditangani
- Hasil `pnpm build` / `pnpm test`
- File proyek yang disesuaikan
