# /refactor

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan edit file langsung.

## Delegasi

1. Klasifikasi refactor (migrasi Router, repo/, `*.case.ts`, queries/, layering)
2. Optional: Task **`explore`** untuk peta modul legacy
3. Task ke subagent **`knitto-agent-refactor`** — **perilaku API tidak boleh berubah**
4. Task **`shell`**: `pnpm build` dan `pnpm test` per modul

## Standar wajib subagent

- [`boilerplate.mdc`](../rules/boilerplate.mdc)
- Skill [`refactor-layered`](../skills/refactor-layered/SKILL.md)
- Snippet: [`feature-scaffold/examples/`](../skills/feature-scaffold/examples/)

## Larangan

- Jangan campur fitur baru atau bugfix lebar dalam delegasi yang sama

## Output ke user

Modul direfactor, mapping legacy → standar, hasil verifikasi.
