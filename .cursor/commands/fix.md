# /fix

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan edit file langsung.

## Delegasi

1. Klasifikasi bug (error, regression, test gagal, perilaku tidak expected)
2. Task ke subagent **`knitto-agent-debugger`** dengan stack trace, path file, langkah reproduksi
3. Task **`shell`**: `pnpm build` dan `pnpm test` untuk file terkait

## Standar wajib subagent

- [`boilerplate.mdc`](../rules/boilerplate.mdc)
- Skill [`debug-backend`](../skills/debug-backend/SKILL.md)

## Larangan

- Jangan delegasi ke `knitto-agent-refactor` atau `knitto-agent-feature` kecuali user explicitly minta perubahan API/struktur

## Output ke user

Root cause, file diubah, cara verifikasi.
