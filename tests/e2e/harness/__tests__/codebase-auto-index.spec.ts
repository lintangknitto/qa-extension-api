import path from 'path';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { DisposableStack, IDisposableStackEndpoints } from '../disposable-stack';
import { seedFixtureData, ISeedResult } from '../db-seed';
import { startBackendService, IBackendService } from '../backend-service';
import { startMockGitHub, IMockGitHub } from '../mock-github';

const projectRoot = path.resolve(__dirname, '../../../../');

type RepoStatus = {
	repo: string;
	branch: string | null;
	status: string;
	last_indexed_sha: string | null;
	last_checked_at: string | null;
	last_error: string | null;
	files_indexed: number;
};

/**
 * Auto-index codebase memory (ISSUES 6.2 & 6.3): pemicu buat program/project, index per repo+branch
 * dipakai bersama, cek SHA (lewati bila sama), incremental per file, token 401, dan Investigasi.
 * GitHub & provider embedding/chat di-mock (`mock-github.ts`).
 */
describe('Codebase auto-index (ISSUES 6.2 & 6.3)', () => {
	jest.setTimeout(240000);

	let stack: DisposableStack;
	let endpoints: IDisposableStackEndpoints;
	let pool: Pool;
	let seeded: ISeedResult;
	let backend: IBackendService;
	let github: IMockGitHub;
	let token = '';
	let projectA = 0;

	const api = async (method: string, url: string, body?: unknown) => {
		const res = await fetch(`${backend.baseUrl}${url}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-request-id': `${Date.now()}-${Math.random()}` },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const json = (await res.json().catch(() => null)) as { result?: any; message?: string } | null;
		return { status: res.status, result: json?.result, message: json?.message };
	};

	const repoStatuses = async (idProject: number): Promise<RepoStatus[]> => (await api('GET', `/projects/${idProject}/codebase/status`)).result?.repos ?? [];

	const waitFor = async <T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 60000): Promise<T> => {
		const deadline = Date.now() + timeoutMs;
		let value = await read();
		while (!done(value) && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 300));
			value = await read();
		}
		return value;
	};

	const widgetFiles = [
		{ path: 'src/chat/send.ts', content: 'export const sendMessage = async (text: string) => {\n\treturn fetch("/api/messages", { method: "POST", body: text });\n};\n' },
		{ path: 'src/chat/list.ts', content: 'export function listMessages(room: string) {\n\treturn fetch(`/api/rooms/${room}/messages`);\n}\n' }
	];

	beforeAll(async () => {
		stack = new DisposableStack();
		endpoints = await stack.start();
		execSync(`pnpm exec tsx "${path.join(projectRoot, 'scripts/migrate.ts')}"`, {
			env: {
				...process.env,
				POSTGRES_HOST: endpoints.postgres.host,
				POSTGRES_PORT: String(endpoints.postgres.port),
				POSTGRES_USER: endpoints.postgres.user,
				POSTGRES_PASSWORD: endpoints.postgres.pass,
				POSTGRES_DB: endpoints.postgres.db
			},
			stdio: 'pipe'
		});
		pool = new Pool({
			host: endpoints.postgres.host,
			port: endpoints.postgres.port,
			user: endpoints.postgres.user,
			password: endpoints.postgres.pass,
			database: endpoints.postgres.db
		});
		seeded = await seedFixtureData(pool, { baseUrl: 'http://127.0.0.1:9' });

		github = await startMockGitHub();
		github.setRepo('knittotextile/knitto-widget-chat', { defaultBranch: 'main', branches: { main: 'sha-1' }, commits: { 'sha-1': widgetFiles }, private: true });
		github.setRepo('knittotextile/e2e-target', {
			defaultBranch: 'main',
			branches: { main: 'sha-t1' },
			commits: { 'sha-t1': [{ path: 'src/order.ts', content: 'export const createOrder = () => 1;\n' }] },
			private: true
		});
		github.setRepo('knittotextile/rahasia', { defaultBranch: 'main', branches: { main: 'sha-r1' }, commits: { 'sha-r1': [] }, private: true });

		backend = await startBackendService(endpoints, {
			extraEnv: {
				GITHUB_API_BASE_URL: github.baseUrl,
				GITHUB_TOKEN: github.token,
				EMBEDDING_BASE_URL: github.aiBaseUrl,
				EMBEDDING_API_KEY: 'e2e',
				OPENAI_BASE_URL: github.aiBaseUrl
			}
		});
		const login = await fetch(`${backend.baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: seeded.user.username, password: seeded.user.passwordPlain })
		});
		token = JSON.stringify(await login.json()).match(/"(?:access_)?token"\s*:\s*"([^"]+)"/)?.[1] ?? '';
		expect(token).not.toBe('');
	});

	afterAll(async () => {
		await backend?.stop().catch(() => undefined);
		await github?.stop().catch(() => undefined);
		await pool?.end().catch(() => undefined);
		await stack?.stop().catch(() => undefined);
	});

	it('6.2a: buat program + project dengan repo private → index terisi otomatis (default branch, SHA tercatat)', async () => {
		const program = await api('POST', '/programs', { name: 'Widget Chat E2E', repo_url: 'https://github.com/knittotextile/knitto-widget-chat' });
		expect(program.status).toBe(201);
		const project = await api('POST', '/projects', { name: 'Project Auto Index A', program_ids: [program.result.id_program] });
		expect(project.status).toBe(201);
		projectA = project.result.id_project;

		const [repo] = await waitFor(() => repoStatuses(projectA), (r) => r[0]?.status === 'idle');
		expect(repo).toMatchObject({ repo: 'knittotextile/knitto-widget-chat', branch: 'main', status: 'idle', last_indexed_sha: 'sha-1', files_indexed: 2 });
		expect(github.counters.contents).toBe(2);
		expect(github.counters.embeddingInputs).toBeGreaterThan(0);
		const chunks = await pool.query('SELECT count(*)::int AS n FROM codebase_chunks');
		expect(chunks.rows[0].n).toBeGreaterThan(0);

		// Pencarian project memakai index repo-nya.
		const search = await api('POST', `/projects/${projectA}/codebase/search`, { query: 'sendMessage', similarity_threshold: 0 });
		expect({ status: search.status, message: search.message }).toMatchObject({ status: 200 });
		expect(search.result.items.length).toBeGreaterThan(0);
	});

	it('6.2b: project kedua dengan repo+branch sama memakai index yang sama (tidak di-index ulang)', async () => {
		const embeddingsBefore = github.counters.embeddingInputs;
		const contentsBefore = github.counters.contents;
		const programId = (await pool.query("SELECT id_program FROM programs WHERE name = 'Widget Chat E2E'")).rows[0].id_program;
		const project = await api('POST', '/projects', { name: 'Project Auto Index B', program_ids: [Number(programId)] });
		const [repo] = await waitFor(() => repoStatuses(project.result.id_project), (r) => r[0]?.status === 'idle');
		expect(repo).toMatchObject({ last_indexed_sha: 'sha-1', files_indexed: 2 });

		const rows = await pool.query("SELECT count(*)::int AS n FROM codebase_repos WHERE repo_key = 'knittotextile/knitto-widget-chat'");
		expect(rows.rows[0].n).toBe(1);
		await new Promise((r) => setTimeout(r, 1000));
		expect(github.counters.contents).toBe(contentsBefore);
		expect(github.counters.embeddingInputs).toBe(embeddingsBefore);
	});

	it('6.2c: sync ulang dengan SHA sama → dilewati (hanya cek SHA), last_checked_at diperbarui', async () => {
		const [before] = await repoStatuses(projectA);
		const headsBefore = github.counters.heads;
		const treesBefore = github.counters.trees;
		const sync = await api('POST', `/projects/${projectA}/codebase/sync`, {});
		expect(sync.status).toBe(200);
		expect(sync.result.completed).toBe(false);
		const [after] = await waitFor(
			() => repoStatuses(projectA),
			(r) => r[0]?.status === 'idle' && r[0]?.last_checked_at !== before.last_checked_at
		);
		expect(after.last_indexed_sha).toBe('sha-1');
		expect(github.counters.heads).toBeGreaterThan(headsBefore);
		expect(github.counters.trees).toBe(treesBefore);
	});

	it('6.2d: commit baru (1 file berubah) → hanya file itu diunduh & di-embed ulang', async () => {
		const contentsBefore = github.counters.contents;
		const embeddingsBefore = github.counters.embeddingInputs;
		github.pushCommit('knittotextile/knitto-widget-chat', 'main', 'sha-2', [
			{ path: 'src/chat/send.ts', content: 'export const sendMessage = async (text: string, room: string) => {\n\treturn fetch(`/api/rooms/${room}/messages`, { method: "POST", body: text });\n};\n' }
		]);
		await api('POST', `/projects/${projectA}/codebase/sync`, {});
		const [repo] = await waitFor(() => repoStatuses(projectA), (r) => r[0]?.last_indexed_sha === 'sha-2' && r[0]?.status === 'idle');
		expect(repo.files_indexed).toBe(2);
		expect(github.counters.contents - contentsBefore).toBe(1);
		expect(github.counters.embeddingInputs - embeddingsBefore).toBeGreaterThan(0);
		const files = await pool.query<{ file_path: string }>('SELECT file_path FROM codebase_files ORDER BY file_path');
		expect(files.rows.map((r) => r.file_path)).toEqual(['src/chat/list.ts', 'src/chat/send.ts']);
	});

	it('6.2e: token ditolak GitHub (401) → status failed dengan pesan jelas, token tidak bocor', async () => {
		const program = await api('POST', '/programs', { name: 'Program Rahasia E2E', repo_url: 'knittotextile/rahasia', repo_branch: 'main' });
		const project = await api('POST', '/projects', { name: 'Project Rahasia', program_ids: [program.result.id_program] });
		await waitFor(() => repoStatuses(project.result.id_project), (r) => r[0]?.status === 'idle');

		// Token dicabut: GitHub membalas 401 untuk token server.
		github.setAcceptedToken('token-lain');
		try {
			await api('POST', `/projects/${project.result.id_project}/codebase/sync`, {});
			const [repo] = await waitFor(() => repoStatuses(project.result.id_project), (r) => r[0]?.status === 'failed');
			expect(repo.status).toBe('failed');
			expect(repo.last_error).toContain('Token GitHub tidak valid atau kedaluwarsa (401)');
			expect(repo.last_error).not.toContain(github.token);
		} finally {
			github.setAcceptedToken(github.token);
		}
	});

	it('6.3: Investigasi pada project dengan index kosong → sync dipicu & laporan berisi "index kode sedang dibangun"', async () => {
		const before = await pool.query("SELECT count(*)::int AS n FROM codebase_repos WHERE repo_key = 'knittotextile/e2e-target'");
		expect(before.rows[0].n).toBe(0);
		const session = await pool.query<{ id_session: string }>(
			`INSERT INTO recording_sessions (id_project, owner_user_id, title, status, result, started_at, ended_at)
			 VALUES ($1, $2, 'Investigasi auto-index', 'ended', 'FAIL', NOW() - interval '5 minutes', NOW())
			 RETURNING id_session`,
			[seeded.project.id, seeded.user.id]
		);
		const promptsBefore = github.chatPrompts.length;
		const res = await api('POST', `/sessions/${session.rows[0].id_session}/investigate`);
		expect(res.status).toBe(200);
		expect(res.result.status).toBe('completed');
		const prompt = github.chatPrompts.slice(promptsBefore).join('\n');
		expect(prompt).toContain('## Konteks kode (codebase memory)');
		expect(prompt).toContain('knittotextile/e2e-target');
		expect(prompt).toContain('index kode sedang dibangun');

		// Sync dipicu di background: repo terdaftar lalu ter-index.
		const [repo] = await waitFor(() => repoStatuses(seeded.project.id), (r) => r[0]?.status === 'idle');
		expect(repo).toMatchObject({ repo: 'knittotextile/e2e-target', last_indexed_sha: 'sha-t1', files_indexed: 1 });
	});

	it('4.5: sync hanya untuk repo/branch milik project; base_dir ditolak untuk QA', async () => {
		const sync = (body: Record<string, unknown>) => api('POST', `/projects/${projectA}/codebase/sync`, body);
		const reposBefore = (await pool.query('SELECT count(*)::int AS n FROM codebase_repos')).rows[0].n;

		const outside = await sync({ repo_url: 'https://github.com/knittotextile/rahasia', branch: 'main' });
		expect(outside.status).not.toBe(200);
		expect(outside.message).toContain('bukan repo project');

		const wrongBranch = await sync({ repo_url: 'https://github.com/knittotextile/knitto-widget-chat', branch: 'feature/x' });
		expect(wrongBranch.status).not.toBe(200);
		expect(wrongBranch.message).toContain('bukan branch');

		const localCopy = await sync({ base_dir: '.' });
		expect(localCopy.status).not.toBe(200);
		expect(localCopy.message).toContain('ADMIN/SUPERADMIN');

		// Tidak ada baris index baru dari permintaan yang ditolak.
		expect((await pool.query('SELECT count(*)::int AS n FROM codebase_repos')).rows[0].n).toBe(reposBefore);

		const ok = await sync({ repo_url: 'knittotextile/knitto-widget-chat', branch: 'main' });
		expect(ok.status).toBe(200);
		expect(ok.result.repos).toEqual([expect.objectContaining({ repo_key: 'knittotextile/knitto-widget-chat', branch: 'main' })]);
		await waitFor(() => repoStatuses(projectA), (r) => r[0]?.status === 'idle');
	});

	it('4.4: sync basi (heartbeat > batas) dilaporkan "Sync terputus" lalu bisa diulang', async () => {
		await pool.query(
			`UPDATE codebase_repos SET status = 'syncing', sync_started_at = NOW() - interval '1 hour'
			 WHERE repo_key = 'knittotextile/knitto-widget-chat'`
		);
		const [stale] = await repoStatuses(projectA);
		expect(stale.status).toBe('failed');
		expect(stale.last_error).toContain('Sync terputus');

		const sync = await api('POST', `/projects/${projectA}/codebase/sync`, {});
		expect(sync.status).toBe(200);
		const [repo] = await waitFor(() => repoStatuses(projectA), (r) => r[0]?.status === 'idle');
		expect(repo).toMatchObject({ status: 'idle', last_indexed_sha: 'sha-2', last_error: null });
		const row = await pool.query("SELECT status FROM codebase_repos WHERE repo_key = 'knittotextile/knitto-widget-chat'");
		expect(row.rows[0].status).toBe('idle');
	});

	it('4.6: embedding gagal di tengah index → file tidak tampak ter-index; sync berikutnya meng-index ulang', async () => {
		github.pushCommit('knittotextile/knitto-widget-chat', 'main', 'sha-3', [
			{ path: 'src/chat/send.ts', content: 'export const sendMessage = async (text: string) => {\n\treturn text.trim();\n};\n' }
		]);
		const fileRow = () =>
			pool.query<{ file_hash: string; git_blob_sha: string | null; chunks: number }>(
				`SELECT f.file_hash, f.git_blob_sha, (SELECT count(*)::int FROM codebase_chunks c WHERE c.id_file = f.id_file) AS chunks
				 FROM codebase_files f WHERE f.file_path = 'src/chat/send.ts'`
			);
		const before = (await fileRow()).rows[0];

		github.setEmbeddingsFailing(true);
		try {
			await api('POST', `/projects/${projectA}/codebase/sync`, {});
			const [failed] = await waitFor(() => repoStatuses(projectA), (r) => r[0]?.status === 'failed');
			expect(failed.status).toBe('failed');
			expect(failed.last_indexed_sha).toBe('sha-2');
			// Tidak ada tulisan parsial: hash/blob & chunk file lama utuh.
			expect((await fileRow()).rows[0]).toEqual(before);
		} finally {
			github.setEmbeddingsFailing(false);
		}

		await api('POST', `/projects/${projectA}/codebase/sync`, {});
		const [repo] = await waitFor(() => repoStatuses(projectA), (r) => r[0]?.status === 'idle' && r[0]?.last_indexed_sha === 'sha-3');
		expect(repo).toMatchObject({ status: 'idle', last_indexed_sha: 'sha-3', files_indexed: 2 });
		const after = (await fileRow()).rows[0];
		expect(after.file_hash).not.toBe('');
		expect(after.file_hash).not.toBe(before.file_hash);
		expect(after.git_blob_sha).not.toBe(before.git_blob_sha);
		expect(after.chunks).toBeGreaterThan(0);
	});

	it('4.7: repo_url dengan owner di luar GITHUB_ALLOWED_OWNERS ditolak di program & project', async () => {
		const reposBefore = (await pool.query('SELECT count(*)::int AS n FROM codebase_repos')).rows[0].n;
		const program = await api('POST', '/programs', { name: 'Program Asing E2E', repo_url: 'https://github.com/other-org/secret' });
		expect(program.status).toBe(400);
		expect(program.message).toContain('tidak diizinkan');
		const project = await api('POST', '/projects', { name: 'Project Asing E2E', repo_url: 'other-org/secret' });
		expect(project.status).toBe(400);
		const update = await api('PUT', `/projects/${projectA}`, { repo_url: 'other-org/secret' });
		expect(update.status).toBe(400);
		expect((await pool.query("SELECT count(*)::int AS n FROM programs WHERE name = 'Program Asing E2E'")).rows[0].n).toBe(0);
		expect((await pool.query('SELECT count(*)::int AS n FROM codebase_repos')).rows[0].n).toBe(reposBefore);
	});
});
