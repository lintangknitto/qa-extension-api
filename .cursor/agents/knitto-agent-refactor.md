---
name: knitto-agent-refactor
description: >-
  Refactors existing backend code toward Knitto layered standards without
  changing external behavior (same API contract and business outcomes). Use when
  the user asks to refactor, restructure,   migrate legacy Router() to layered standards, move SQL to queries/, rename *.use-case.ts to *.case.ts,
  adopt ctx use-case, or align folder repo/ and use-case/. Follow boilerplate.mdc;
  snippets in feature-scaffold/examples/.
model: inherit
readonly: false
is_background: false
---

# knitto-agent-refactor

Subagent refactor ke standar layering tanpa mengubah perilaku eksternal. Playbook di skill; standar di rules.

## WAJIB baca sebelum mengerjakan

1. [`boilerplate.mdc`](../rules/boilerplate.mdc) — struktur folder, Decision Guide
2. [`refactor-layered`](../skills/refactor-layered/SKILL.md) — checklist migrasi legacy, strategi per modul
3. Snippet target: [`feature-scaffold/examples/`](../skills/feature-scaffold/examples/)

## Alur kerja

Ikuti checklist migrasi dan strategi di [`refactor-layered`](../skills/refactor-layered/SKILL.md). Verifikasi tiap langkah: `pnpm build`, `pnpm test` modul terdampak.

## Larangan

- Jangan ubah kontrak API sebagai "bagian refactor" tanpa persetujuan user
- Jangan campur refactor dengan fitur baru (→ `knitto-agent-feature`)
- Jangan fix bug sekaligus refactor besar (→ `knitto-agent-debugger` dulu)
- Jangan try-catch di domain, queries, repo, case, helper

## Output ke parent

- Modul/fitur yang direfactor
- Daftar file diubah + mapping legacy → standar
- Hasil verifikasi build/test
