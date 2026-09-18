# Cursor subagents — Knitto REST backend

Indeks **custom subagent** (`.cursor/agents/knitto-agent-*.md`). Root chat dengan **orchestrator strict** mendelegasi via Task — lihat [orchestrator.mdc](../rules/orchestrator.mdc) dan [commands/](../commands/).

**Standar kode:** [boilerplate.mdc](../rules/boilerplate.mdc). **Playbook detail:** [skills/README.md](../skills/README.md) — dibaca subagent saat dijalankan, bukan pengganti delegasi root.

## Subagent ↔ skill ↔ slash command

| Subagent | Skill (playbook) | Command | Kapan root delegasi |
| -------- | ---------------- | ------- | ------------------- |
| `knitto-agent-feature` | [feature-scaffold](../skills/feature-scaffold/SKILL.md) (+ [examples](../skills/feature-scaffold/examples/)) | `/feature` | Endpoint/fitur baru, ubah API, perluasan modul HTTP |
| `knitto-agent-debugger` | [debug-backend](../skills/debug-backend/SKILL.md) | `/fix` | Bug, error, regression, test gagal |
| `knitto-agent-refactor` | [refactor-layered](../skills/refactor-layered/SKILL.md) | `/refactor` | Migrasi layering, repo/queries/case, selaraskan routes dengan standar |
| `knitto-agent-upgrade` | [dependency-upgrade](../skills/dependency-upgrade/SKILL.md) | `/upgrade` | Bump package, fix pasca-upgrade |
| `knitto-agent-security` | [security-owasp-minimal](../skills/security-owasp-minimal/SKILL.md) | `/security` | Audit OWASP, hardening; fix hanya jika user minta |
| `knitto-agent-prd` | [prd-author](../skills/prd-author/SKILL.md) | `/prd` | Prompt ide → PRD di `docs/pb/.../prd.md` (PC) |
| `knitto-agent-planner` | [dev-plan-api](../skills/dev-plan-api/SKILL.md) | — (pipeline server) | Plan + api-design dari PRD |
| `knitto-agent-reviewer` | [pr-review-knitto](../skills/pr-review-knitto/SKILL.md) | — (pipeline server) | Review PR readonly |
| `knitto-agent-babysit` | [pr-babysit](../skills/pr-babysit/SKILL.md) | — (`run-babysit.mjs`) | PR merge-ready: conflict, CI, komentar review |

### Skill tambahan (tanpa subagent dedikasi)

| Skill | Subagent yang memakai |
| ----- | --------------------- |
| [knitto-rabbitmq-consumer](../skills/knitto-rabbitmq-consumer/SKILL.md) | `knitto-agent-feature` (baru) · `knitto-agent-upgrade` (migrasi v1→v2) |
| [db-migration](../skills/db-migration/SKILL.md) | `knitto-agent-feature` · `knitto-agent-debugger` (hotfix DB, jarang) |
| [security-owasp-minimal](../skills/security-owasp-minimal/SKILL.md) | `knitto-agent-security` · `knitto-agent-feature` · `knitto-agent-reviewer` |

## Pipeline server (CLI)

Stage prompt: [automation/prompts/](../automation/prompts/). Kontrak output JSON review: [stage-review.md](../automation/prompts/stage-review.md).

## Verifikasi umum

Setelah subagent implementasi/fix/refactor/upgrade: `pnpm build`, `pnpm test`, `pnpm lint` (scope HTTP bila relevan).
