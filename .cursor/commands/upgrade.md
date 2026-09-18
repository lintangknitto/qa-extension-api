# /upgrade

Mode **orchestrator strict**. Root **HANYA** koordinator — jangan edit file langsung.

## Delegasi

1. Klasifikasi upgrade (package, versi target, error pasca-bump)
2. Task ke subagent **`knitto-agent-upgrade`**
3. Task **`shell`**: `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` bila perlu

## Standar wajib subagent

- [`boilerplate.mdc`](../rules/boilerplate.mdc)
- Skill [`dependency-upgrade`](../skills/dependency-upgrade/SKILL.md)
- README package: `node_modules/@knittotextile/<pkg>/README.md`

## Larangan

- **Major bump** tanpa konfirmasi user via **AskQuestion**
- Jangan campur refactor fitur dalam delegasi yang sama

## Output ke user

Package di-bump, breaking changes ditangani, hasil build/test.
