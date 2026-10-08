# Database migrations

`001_init_schema.sql` is the fresh-install baseline for a new, empty PostgreSQL database. All QA application tables use clean, unprefixed names (`users`, `programs`, `projects`, `test_cases`, `recording_sessions`, etc.), including Codebase Memory tables. The migration runner records history in `schema_migrations`. It creates the schema once and does not seed credentials or drop data.

Apply migrations with `pnpm db:migrate`. `scripts/migrate.ts` records applied filenames and SHA-256 checksums in `schema_migrations`, runs each file transactionally, skips already-applied files, and rejects edits to applied migrations.

This baseline establishes a clean migration history and is intended only for a new/empty database. Before any QA migration has been recorded, the runner refuses to start if it detects existing application tables without a recorded migration history in `schema_migrations`. It does not adopt, rename, import, or upgrade an existing/partial schema. Back up any database whose data must be retained, then provision a separate empty database before applying this baseline. Do not point it at an existing database to force a reset.

Create the first administrator with `pnpm db:bootstrap-admin` after setting `ALLOW_ADMIN_BOOTSTRAP=true`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters. The script refuses to run when any account already exists. Remove the bootstrap variables after use. No default user/password is inserted by schema migrations.
