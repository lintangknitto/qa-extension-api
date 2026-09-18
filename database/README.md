# Database migrations (SQL manual)

Folder ini berisi **file migration SQL** yang di-apply manual ke target DB (dev/staging/prod) via client DBA — **bukan** runner migrate otomatis di repo.

## Penamaan file

| Konteks | Pola | Contoh |
|---------|------|--------|
| Product Backlog | `PB-x.x.x.sql` | `database/PB-1.2.0.sql` |
| Production issue | `YYYYMMDDHHmmss.sql` | `database/20250727143000.sql` |

## Playbook agent

Lihat [`.cursor/skills/db-migration/SKILL.md`](../.cursor/skills/db-migration/SKILL.md) — template SQL di `examples/`, konvensi layering di [`boilerplate.mdc`](../.cursor/rules/boilerplate.mdc).

## Query & mutasi aplikasi

SELECT → `queries/` · INSERT/UPDATE/DELETE → `repo/` · aturan package → [`.cursor/rules/knitto-mysql.mdc`](../.cursor/rules/knitto-mysql.mdc).
