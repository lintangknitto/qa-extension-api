# /feature

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan edit file langsung.

## Delegasi

1. Klasifikasi intent fitur (endpoint baru, perubahan API, perluasan modul)
2. Optional: Task **`explore`** bila struktur modul belum jelas
3. Task ke subagent **`knitto-agent-feature`** dengan konteks lengkap (path, requirement, constraint)
4. Task **`shell`**: `pnpm build` dan `pnpm test` untuk scope terdampak

## Standar wajib subagent

- [`boilerplate.mdc`](../rules/boilerplate.mdc)
- Skill [`feature-scaffold`](../skills/feature-scaffold/SKILL.md)
- Snippet: [`feature-scaffold/examples/`](../skills/feature-scaffold/examples/)

## Output ke user

Ringkas: file diubah, breaking change (jika ada), langkah verifikasi.
