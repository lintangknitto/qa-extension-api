# /security

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan edit file langsung kecuali user explicitly minta root non-strict (jarang).

## Delegasi

1. Klasifikasi intent: audit keamanan, OWASP, hardening, review security diff/modul
2. Optional: Task **`explore`** bila scope modul belum jelas
3. Task ke subagent **`knitto-agent-security`** dengan konteks lengkap (path, diff, branch, constraint)
4. **Fix:** hanya jika user **eksplisit** minta perbaikan/remediasi — subagent boleh edit; lalu Task **`shell`**: `pnpm build`, `pnpm test`
5. **Default (audit saja):** subagent readonly assessment — tidak wajib shell kecuali user minta verifikasi build

## Standar wajib subagent

- [`knitto-security.mdc`](../rules/knitto-security.mdc)
- Skill [`security-owasp-minimal`](../skills/security-owasp-minimal/SKILL.md)
- Snippet: [`security-owasp-minimal/examples/`](../skills/security-owasp-minimal/examples/)
- [`boilerplate.mdc`](../rules/boilerplate.mdc)

## Output ke user

Ringkas: finding (blocker vs note), file terdampak, rekomendasi; atau file diubah + verifikasi bila fix mode.

## vs `/fix`

- **`/security`** — assessment OWASP, hardening, guest/SQL/auth; fix hanya on request
- **`/fix`** — bug fungsional, error runtime, test gagal → `knitto-agent-debugger`
