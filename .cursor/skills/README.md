# Cursor skills — Knitto REST backend

Indeks skill proyek (playbook subagent). **Delegasi intent user:** [orchestrator.mdc](../rules/orchestrator.mdc) + [commands/](../commands/) — skill **bukan** pengganti Task ke subagent.

**Standar arsitektur:** [boilerplate.mdc](../rules/boilerplate.mdc). **API library:** `node_modules/@knittotextile/*/README.md`.

| Skill                        | Subagent                                        | Kapan dipakai                                                | Path                                                                     |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **feature-scaffold**         | `knitto-agent-feature`                          | Fitur baru, ubah API/perilaku endpoint, perluasan modul HTTP | [feature-scaffold/SKILL.md](./feature-scaffold/SKILL.md)                 |
| **debug-backend**            | `knitto-agent-debugger`                         | Bug, error, regression, test gagal, root cause analysis      | [debug-backend/SKILL.md](./debug-backend/SKILL.md)                       |
| **refactor-layered**         | `knitto-agent-refactor`                         | Restructure ke standar layering, perilaku API tetap sama     | [refactor-layered/SKILL.md](./refactor-layered/SKILL.md)                 |
| **dependency-upgrade**       | `knitto-agent-upgrade`                          | Bump package, fix breaking changes setelah upgrade           | [dependency-upgrade/SKILL.md](./dependency-upgrade/SKILL.md)             |
| **knitto-rabbitmq-consumer** | `knitto-agent-feature` / `knitto-agent-upgrade` | Buat/migrasi RabbitMQ consumer v2 (`createConsumer`)         | [knitto-rabbitmq-consumer/SKILL.md](./knitto-rabbitmq-consumer/SKILL.md) |
| **db-migration**             | `knitto-agent-feature` / `knitto-agent-debugger` | File SQL schema di `database/` (PB / prod issue), apply manual | [db-migration/SKILL.md](./db-migration/SKILL.md)                         |
| **openapi-manual-sync**      | `knitto-agent-feature` / `knitto-agent-reviewer` | Sync manual `docs/openapi/openapi.yaml` saat kontrak HTTP berubah | [openapi-manual-sync/SKILL.md](./openapi-manual-sync/SKILL.md)           |
| **security-owasp-minimal**   | `knitto-agent-security` / `knitto-agent-feature` / `knitto-agent-reviewer` | Checklist OWASP minimal; audit `/security`; blocker PR review | [security-owasp-minimal/SKILL.md](./security-owasp-minimal/SKILL.md)   |
| **pr-babysit**               | `knitto-agent-babysit`                          | PR merge-ready (conflict, CI, review) — CLI `run-babysit`   | [pr-babysit/SKILL.md](./pr-babysit/SKILL.md)                             |

### Pipeline — PC (PRD)

| Skill          | Subagent           | Kapan dipakai                                                    | Path                                         |
| -------------- | ------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| **prd-author** | `knitto-agent-prd` | Analisa prompt → PRD terstruktur di `docs/pb/{PB}/{task}/prd.md` | [prd-author/SKILL.md](./prd-author/SKILL.md) |

### Pipeline — server (CLI)

| Skill                | Subagent                | Kapan dipakai                      | Path                                                     |
| -------------------- | ----------------------- | ---------------------------------- | -------------------------------------------------------- |
| **dev-plan-api**     | `knitto-agent-planner`  | Plan + API design dari PRD di repo | [dev-plan-api/SKILL.md](./dev-plan-api/SKILL.md)         |
| **pr-review-knitto** | `knitto-agent-reviewer` | Checklist review PR (format JSON: [stage-review.md](../automation/prompts/stage-review.md)) | [pr-review-knitto/SKILL.md](./pr-review-knitto/SKILL.md) |

PC workflow: [`.cursor/automation/pc-workflow.md`](../automation/pc-workflow.md)

Snippet kode scaffold: [feature-scaffold/examples/](./feature-scaffold/examples/).

Subagent pasangan (delegasi strict): [`.cursor/agents/README.md`](../agents/README.md). Orchestrator: [`.cursor/rules/orchestrator.mdc`](../rules/orchestrator.mdc).
