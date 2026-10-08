import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import postgresConnection from '../src/libs/config/postgresConnection';

const migrationsDir = path.resolve(__dirname, '../database/migrations');

async function runMigrations(): Promise<void> {
	const pool = await postgresConnection.getPool();
	const client = await pool.connect();

	try {
		await client.query('SELECT pg_advisory_lock($1)', [84201945]);
		const hasMigrationTable = await client.query<{ exists: boolean }>(
			"SELECT to_regclass('schema_migrations') IS NOT NULL AS exists"
		);
		const hasAppliedMigration = hasMigrationTable.rows[0].exists
			? await client.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM schema_migrations) AS exists')
			: { rows: [{ exists: false }] };

		const existingSchema = await client.query<{
			has_existing_tables: boolean;
		}>(
			`SELECT
				EXISTS (
					SELECT 1
					FROM information_schema.tables
					WHERE table_schema = current_schema()
						AND table_name = ANY($1::text[])
				) AS has_existing_tables`,
			[[
				'users', 'programs', 'projects', 'project_programs', 'user_projects', 'test_cases',
				'recording_sessions', 'recording_checkpoints', 'recording_events', 'recording_artifacts',
				'recording_generations', 'codebase_files', 'codebase_symbols', 'codebase_chunks',
				'qa_user', 'qa_program', 'qa_project', 'qa_project_program', 'qa_user_project', 'qa_test_case',
				'qa_recording_session', 'qa_recording_checkpoint', 'qa_recording_event', 'qa_recording_artifact',
				'qa_recording_generation', 'qa_codebase_file', 'qa_codebase_symbol', 'qa_codebase_chunk',
				'qa_schema_migrations'
			]]
		);

		if (!hasAppliedMigration.rows[0].exists && existingSchema.rows[0].has_existing_tables) {
			throw new Error('Database sudah memiliki tabel/schema tanpa riwayat migration QA yang valid; gunakan database QA baru yang kosong, jangan gabungkan atau adopsi schema parsial.');
		}

		await client.query(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version TEXT PRIMARY KEY,
				checksum CHAR(64) NOT NULL,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		const files = fs.readdirSync(migrationsDir)
			.filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
			.sort();

		for (const file of files) {
			const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
			const checksum = crypto.createHash('sha256').update(sql).digest('hex');
			const existing = await client.query<{ checksum: string }>(
				'SELECT checksum FROM schema_migrations WHERE version = $1',
				[file]
			);

			if (existing.rowCount) {
				if (existing.rows[0].checksum !== checksum) {
					throw new Error(`Migration ${file} sudah diterapkan dengan checksum berbeda; jangan ubah migration yang sudah berjalan.`);
				}
				continue;
			}

			console.info(`Applying ${file}`);
			await client.query('BEGIN');
			try {
				await client.query(sql);
				await client.query(
					'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
					[file, checksum]
				);
				await client.query('COMMIT');
			} catch (error) {
				await client.query('ROLLBACK');
				throw error;
			}
		}

		console.info('Database migrations are up to date.');
	} finally {
		await client.query('SELECT pg_advisory_unlock($1)', [84201945]).catch(() => undefined);
		client.release();
		await postgresConnection.end();
	}
}

runMigrations().catch((error: unknown) => {
	console.error('Database migration failed:', error);
	process.exitCode = 1;
});
