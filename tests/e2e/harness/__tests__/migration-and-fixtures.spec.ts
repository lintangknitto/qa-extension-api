import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import http from 'http';
import { DisposableStack } from '../disposable-stack';
import { startFixtureServer } from '../fixture-server';
import { seedFixtureData } from '../db-seed';

describe('PostgreSQL Migration & Fixtures (Checkpoint 2)', () => {
	jest.setTimeout(90000);

	let stack: DisposableStack;
	let endpoints: ReturnType<DisposableStack['getEndpoints']>;
	const migrateScriptPath = path.resolve(__dirname, '../../../../scripts/migrate.ts');

	beforeAll(async () => {
		stack = new DisposableStack();
		endpoints = await stack.start();
	});

	afterAll(async () => {
		if (stack) {
			await stack.stop();
		}
	});

	it('2.1: Menjalankan migration pada database kosong dan terbukti idempotent saat rerun', async () => {
		const env = {
			...process.env,
			POSTGRES_HOST: endpoints.postgres.host,
			POSTGRES_PORT: String(endpoints.postgres.port),
			POSTGRES_USER: endpoints.postgres.user,
			POSTGRES_PASSWORD: endpoints.postgres.pass,
			POSTGRES_DB: endpoints.postgres.db
		};

		// 1. First run on empty database
		const firstRunOutput = execSync(`pnpm exec tsx "${migrateScriptPath}"`, { env, encoding: 'utf-8' });
		expect(firstRunOutput).toContain('Applying 001_init_schema.sql');
		expect(firstRunOutput).toContain('Applying 002_test_case_templates_v4.sql');
		expect(firstRunOutput).toContain('Database migrations are up to date.');

		const pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});

		try {
			// Verifikasi tabel migration history
			const migRows = await pool.query<{ version: string; checksum: string }>(
				'SELECT version, checksum FROM schema_migrations ORDER BY version'
			);
			expect(migRows.rows.map((r) => r.version)).toEqual(['001_init_schema.sql', '002_test_case_templates_v4.sql']);

			// Seed template V4 default
			const templateRows = await pool.query<{ version_label: string; is_default: boolean; gid: string; columns: string }>(
				`SELECT version_label, is_default, gid, (SELECT COUNT(*) FROM jsonb_object_keys(column_mapping)) AS columns
				 FROM test_case_templates`
			);
			expect(templateRows.rows).toEqual([
				{ version_label: 'V4', is_default: true, gid: '1730053292', columns: '17' }
			]);

			// Verifikasi ekstensi pgvector
			const extRows = await pool.query<{ extname: string }>(
				"SELECT extname FROM pg_extension WHERE extname = 'vector'"
			);
			expect(extRows.rows.length).toBe(1);

			// Verifikasi tabel-tabel utama recording & master domain
			const tableRows = await pool.query<{ table_name: string }>(
				`SELECT table_name FROM information_schema.tables 
				 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
			);
			const tableNames = tableRows.rows.map((r) => r.table_name);
			expect(tableNames).toContain('users');
			expect(tableNames).toContain('programs');
			expect(tableNames).toContain('projects');
			expect(tableNames).toContain('project_programs');
			expect(tableNames).toContain('test_cases');
			expect(tableNames).toContain('recording_sessions');
			expect(tableNames).toContain('recording_checkpoints');
			expect(tableNames).toContain('recording_events');
			expect(tableNames).toContain('recording_artifacts');
			expect(tableNames).toContain('recording_generations');

			// 2. Second run: Idempotency check (tidak ada error, migration count tetap 2, seed V4 tidak dobel)
			const secondRunOutput = execSync(`pnpm exec tsx "${migrateScriptPath}"`, { env, encoding: 'utf-8' });
			expect(secondRunOutput).not.toContain('Applying 001_init_schema.sql');
			expect(secondRunOutput).not.toContain('Applying 002_test_case_templates_v4.sql');
			expect(secondRunOutput).toContain('Database migrations are up to date.');

			const migRowsAfter = await pool.query('SELECT COUNT(*) AS total FROM schema_migrations');
			expect(parseInt(migRowsAfter.rows[0].total, 10)).toBe(2);
			const templateCountAfter = await pool.query('SELECT COUNT(*) AS total FROM test_case_templates');
			expect(parseInt(templateCountAfter.rows[0].total, 10)).toBe(1);
		} finally {
			await pool.end();
		}
	});

	it('2.2: Menolak database yang memiliki tabel legacy / partial schema tanpa riwayat migration yang sah', async () => {
		const rootPool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: 'postgres'
		});

		const legacyDbName = `legacy_partial_db_${Date.now()}`;
		try {
			// Buat database disposable kedua
			await rootPool.query(`CREATE DATABASE "${legacyDbName}"`);

			const legacyPool = new Pool({
				host: endpoints.postgres.host,
				port: endpoints.postgres.port,
				user: endpoints.postgres.user,
				password: endpoints.postgres.pass,
				database: legacyDbName
			});

			// Buat tabel legacy tanpa migration history
			await legacyPool.query('CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100))');
			await legacyPool.end();

			const env = {
				...process.env,
				POSTGRES_HOST: endpoints.postgres.host,
				POSTGRES_PORT: String(endpoints.postgres.port),
				POSTGRES_USER: endpoints.postgres.user,
				POSTGRES_PASSWORD: endpoints.postgres.pass,
				POSTGRES_DB: legacyDbName
			};

			expect(() => {
				execSync(`pnpm exec tsx "${migrateScriptPath}"`, { env, encoding: 'utf-8', stdio: 'pipe' });
			}).toThrow(/Database sudah memiliki tabel\/schema tanpa riwayat migration QA yang valid/);
		} finally {
			await rootPool.query(`DROP DATABASE IF EXISTS "${legacyDbName}"`).catch(() => undefined);
			await rootPool.end();
		}
	});

	it('2.3: Fixture web app dan database seeding berhasil disiapkan dengan fake test credentials', async () => {
		const fixture = await startFixtureServer();
		expect(fixture.port).toBeGreaterThan(0);

		try {
			// Cek response HTTP fixture site
			const pageContent = await new Promise<string>((resolve, reject) => {
				http.get(fixture.baseUrl, (res) => {
					let data = '';
					res.on('data', (chunk) => (data += chunk));
					res.on('end', () => resolve(data));
					res.on('error', reject);
				});
			});

			expect(pageContent).toContain('Portal Knitto Fixture App');
			expect(pageContent).toContain('data-testid="submit-btn"');
			expect(pageContent).toContain('fake_auth_token');

			// Seed database
			const pool = new Pool({
				host: endpoints.postgres.host,
				port: endpoints.postgres.port,
				user: endpoints.postgres.user,
				password: endpoints.postgres.pass,
				database: endpoints.postgres.db
			});

			try {
				const seeded = await seedFixtureData(pool, { baseUrl: fixture.baseUrl });
				expect(seeded.user.id).toBeGreaterThan(0);
				expect(seeded.user.level).toBe('QA');
				expect(seeded.program.baseUrl).toBe(fixture.baseUrl);
				expect(seeded.project.id).toBeGreaterThan(0);
				expect(seeded.testCase.testCaseNo).toMatch(/^TC-E2E-/);

				// Pastikan password di database ter-hash
				const userInDb = await pool.query<{ password: string }>(
					'SELECT password FROM users WHERE id_user = $1',
					[seeded.user.id]
				);
				expect(userInDb.rows[0].password.startsWith('$2')).toBe(true);
			} finally {
				await pool.end();
			}
		} finally {
			await fixture.stop();
		}
	});

	it('2.4: Deterministic Mock AI menghasilkan respons terprediksi untuk Markdown dan Playwright', async () => {
		const makeAiRequest = async (systemPrompt: string): Promise<string> => {
			const postData = JSON.stringify({
				model: 'mock-gpt-4o',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: 'Generate test summary' }
				]
			});

			return new Promise((resolve, reject) => {
				const req = http.request(
					{
						hostname: endpoints.mockAi.host,
						port: endpoints.mockAi.port,
						path: '/v1/chat/completions',
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Content-Length': Buffer.byteLength(postData)
						}
					},
					(res) => {
						let data = '';
						res.on('data', (c) => (data += c));
						res.on('end', () => {
							const parsed = JSON.parse(data);
							resolve(parsed.choices[0].message.content);
						});
						res.on('error', reject);
					}
				);
				req.write(postData);
				req.end();
			});
		};

		// Test prompt markdown
		const markdownOutput = await makeAiRequest('Kamu asisten QA senior. Buat ringkasan hasil pengujian dalam Markdown.');
		expect(markdownOutput).toContain('# Ringkasan Pengujian QA');
		expect(markdownOutput).toContain('PASS');

		// Test prompt playwright
		const playwrightOutput = await makeAiRequest('Kamu adalah QA Automation Engineer. Buat skrip otomasi Playwright.');
		expect(playwrightOutput).toContain("import { test, expect } from '@playwright/test'");
		expect(playwrightOutput).toContain('page.goto');
	});
});
