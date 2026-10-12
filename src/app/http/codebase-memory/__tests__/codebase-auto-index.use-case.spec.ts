jest.mock('@/app/http/project/queries/project.queries');
jest.mock('../queries/codebase-repo.queries');
jest.mock('../services/repo-sync.service', () => ({
	requestRepoSync: jest.fn(),
	resolveRepoRow: jest.fn(),
	triggerRepoTargets: jest.fn(),
	isRepoSyncRunning: jest.fn().mockReturnValue(false),
	createSyncHeartbeat: jest.fn(() => async () => undefined)
}));
jest.mock('../services/github.service', () => ({
	__esModule: true,
	default: {
		parseRepoUrl: (url: string) => {
			const [owner, repo] = url.replace('https://github.com/', '').split('/');
			return { owner, repo };
		},
		getDefaultBranch: jest.fn().mockResolvedValue('main')
	}
}));
jest.mock('../services/codebase-indexer.service', () => ({ indexLocalDirectory: jest.fn() }));
jest.mock('../repo/codebase-repo.repo', () => ({
	claimRepoSync: jest.fn(async (id: number) => ({ id_repo: id, repo_key: 'knittotextile/knitto-widget-chat', branch: 'main' })),
	markRepoFailed: jest.fn(),
	markRepoSynced: jest.fn()
}));
jest.mock('../queries/codebase.queries', () => ({ searchCodebaseChunksByVector: jest.fn().mockResolvedValue([]) }));
jest.mock('@/libs/services/embedding.service', () => ({
	__esModule: true,
	default: { generateEmbedding: jest.fn().mockResolvedValue([0.1]), formatVectorForPg: () => '[0.1]' }
}));

import * as projectQueries from '@/app/http/project/queries/project.queries';
import * as repoQueries from '../queries/codebase-repo.queries';
import { requestRepoSync, resolveRepoRow, triggerRepoTargets } from '../services/repo-sync.service';
import { searchCodebaseChunksByVector } from '../queries/codebase.queries';
import { syncCodebaseUseCase } from '../use-case/sync-codebase.use-case';
import { codebaseStatusUseCase } from '../use-case/codebase-status.use-case';
import { getProjectCodeContext } from '../use-case/project-code-context.use-case';

const project = {
	id_project: 1,
	name: 'Knitto Live Chat',
	is_active: 1,
	created_by_user_id: 10,
	repo_url: 'https://github.com/knittotextile/knitto-widget-chat',
	programs: [
		{ id_program: 1, name: 'Widget', code: 'w', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', repo_branch: null },
		{ id_program: 2, name: 'API', code: 'a', repo_url: 'https://github.com/knittotextile/knitto-api-chat', repo_branch: 'develop' }
	]
};

const repoRow = (extra: Partial<Entity.IQaCodebaseRepo>): Entity.IQaCodebaseRepo => ({
	id_repo: 1,
	repo_key: 'knittotextile/knitto-widget-chat',
	repo_url: project.repo_url,
	branch: 'main',
	last_indexed_sha: null,
	status: 'idle',
	last_error: null,
	sync_started_at: null,
	last_synced_at: null,
	last_checked_at: null,
	...extra
});

beforeEach(() => {
	jest.clearAllMocks();
	(projectQueries.findProjectById as jest.Mock).mockResolvedValue(project);
	(resolveRepoRow as jest.Mock).mockImplementation(async (t: { repo_key: string; branch: string | null }) =>
		repoRow({ id_repo: t.repo_key.endsWith('api-chat') ? 2 : 1, repo_key: t.repo_key, branch: t.branch ?? 'main' })
	);
	(requestRepoSync as jest.Mock).mockImplementation(async (id: number) => ({ id_repo: id, status: 'synced', sha: `sha-${id}` }));
});

describe('syncCodebaseUseCase (body kosong = semua repo project)', () => {
	it('default: dijalankan di background, respons langsung berisi repo yang di-sync', async () => {
		const result = await syncCodebaseUseCase({ id_project: 1, userId: 10, userLevel: 'ADMIN' });
		expect(result.completed).toBe(false);
		expect(result.repos.map((r) => `${r.repo_key}@${r.branch}`)).toEqual([
			'knittotextile/knitto-widget-chat@main',
			'knittotextile/knitto-api-chat@develop'
		]);
		expect(requestRepoSync).toHaveBeenCalledWith(1, { force: false });
		expect(requestRepoSync).toHaveBeenCalledWith(2, { force: false });
	});

	it('wait (CLI) menunggu hasil; force diteruskan', async () => {
		const result = await syncCodebaseUseCase({ id_project: 1, wait: true, force_reindex: true, trusted: true });
		expect(result.completed).toBe(true);
		expect(result.repos.map((r) => r.status)).toEqual(['synced', 'synced']);
		expect(requestRepoSync).toHaveBeenCalledWith(1, { force: true });
	});

	it('CLI (trusted): repo_url + branch bebas → hanya repo itu', async () => {
		await syncCodebaseUseCase({ id_project: 1, repo_url: 'knittotextile/knitto-api-chat', branch: 'main', wait: true, trusted: true });
		expect(resolveRepoRow).toHaveBeenCalledWith({
			repo_key: 'knittotextile/knitto-api-chat',
			repo_url: 'knittotextile/knitto-api-chat',
			branch: 'main',
			program: null
		});
		expect(requestRepoSync).toHaveBeenCalledTimes(1);
	});

	it('project tanpa repo → error jelas', async () => {
		(projectQueries.findProjectById as jest.Mock).mockResolvedValue({ ...project, repo_url: null, programs: [] });
		await expect(syncCodebaseUseCase({ id_project: 1, trusted: true })).rejects.toThrow('Project belum punya repo');
	});

	it('QA bukan pembuat project tidak boleh memicu sync', async () => {
		await expect(syncCodebaseUseCase({ id_project: 1, userId: 99, userLevel: 'QA' })).rejects.toThrow();
		expect(requestRepoSync).not.toHaveBeenCalled();
	});
});

describe('syncCodebaseUseCase otorisasi index bersama (4.5)', () => {
	const admin = { id_project: 1, userId: 10, userLevel: 'ADMIN' };

	it('tanpa user dan bukan CLI → ditolak', async () => {
		await expect(syncCodebaseUseCase({ id_project: 1 })).rejects.toThrow('wewenang');
		expect(requestRepoSync).not.toHaveBeenCalled();
	});

	it('repo_url di luar repo project → ditolak', async () => {
		await expect(syncCodebaseUseCase({ ...admin, repo_url: 'https://github.com/other/secret-repo' })).rejects.toThrow('bukan repo project');
		expect(resolveRepoRow).not.toHaveBeenCalled();
	});

	it('repo project dengan branch program → diterima; branch lain → ditolak', async () => {
		await syncCodebaseUseCase({ ...admin, repo_url: 'knittotextile/knitto-api-chat', branch: 'develop' });
		expect(resolveRepoRow).toHaveBeenCalledWith(expect.objectContaining({ repo_key: 'knittotextile/knitto-api-chat', branch: 'develop' }));
		await expect(syncCodebaseUseCase({ ...admin, repo_url: 'knittotextile/knitto-api-chat', branch: 'main' })).rejects.toThrow('bukan branch');
	});

	it('repo yang mengikuti default branch: hanya default branch yang boleh disebut', async () => {
		await syncCodebaseUseCase({ ...admin, repo_url: 'https://github.com/knittotextile/knitto-widget-chat', branch: 'main' });
		expect(resolveRepoRow).toHaveBeenCalledWith(expect.objectContaining({ repo_key: 'knittotextile/knitto-widget-chat', branch: 'main' }));
		await expect(
			syncCodebaseUseCase({ ...admin, repo_url: 'https://github.com/knittotextile/knitto-widget-chat', branch: 'feature/x' })
		).rejects.toThrow('bukan branch');
	});

	it('CLI (trusted) pun tidak bisa meng-index repo di luar allowlist owner (4.7)', async () => {
		await expect(syncCodebaseUseCase({ id_project: 1, repo_url: 'https://github.com/other/secret', wait: true, trusted: true })).rejects.toThrow(
			'tidak diizinkan'
		);
		expect(resolveRepoRow).not.toHaveBeenCalled();
	});

	it('base_dir hanya untuk ADMIN/SUPERADMIN', async () => {
		(projectQueries.findProjectById as jest.Mock).mockResolvedValue({ ...project, programs: [] });
		await expect(syncCodebaseUseCase({ id_project: 1, userId: 10, userLevel: 'QA', base_dir: '.' })).rejects.toThrow('ADMIN/SUPERADMIN');
		await expect(syncCodebaseUseCase({ ...admin, base_dir: '.' })).resolves.toMatchObject({ completed: true });
	});
});

describe('codebaseStatusUseCase', () => {
	it('status per repo project: idle dengan SHA & jumlah file, belum ter-index, gagal dengan alasan', async () => {
		(repoQueries.findRepoForTarget as jest.Mock).mockImplementation(async (key: string) =>
			key.endsWith('widget-chat') ? repoRow({ id_repo: 1, last_indexed_sha: 'abc1234def', last_synced_at: '2026-10-12T05:00:00Z' }) : null
		);
		(repoQueries.countIndexedFiles as jest.Mock).mockResolvedValue(new Map([[1, 42]]));
		const result = await codebaseStatusUseCase({ idProject: 1, userId: 99, userLevel: 'QA' });
		expect(result.can_sync).toBe(false);
		expect(result.repos).toEqual([
			expect.objectContaining({
				repo: 'knittotextile/knitto-widget-chat',
				branch: 'main',
				tracks_default_branch: true,
				program: 'Widget',
				status: 'idle',
				last_indexed_sha: 'abc1234def',
				files_indexed: 42
			}),
			expect.objectContaining({
				repo: 'knittotextile/knitto-api-chat',
				branch: 'develop',
				tracks_default_branch: false,
				status: 'not_indexed',
				files_indexed: 0
			})
		]);

		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(
			repoRow({ branch: '', status: 'failed', last_error: 'Token GitHub tidak valid atau kedaluwarsa (401)' })
		);
		const failed = await codebaseStatusUseCase({ idProject: 1, userId: 10, userLevel: 'ADMIN' });
		expect(failed.can_sync).toBe(true);
		expect(failed.repos[0]).toMatchObject({ status: 'failed', branch: null, last_error: 'Token GitHub tidak valid atau kedaluwarsa (401)' });
	});
});

describe('sync basi (4.4)', () => {
	const staleStart = new Date(Date.now() - 60 * 60_000).toISOString();

	it('status: syncing dengan heartbeat basi → failed "sync terputus"; heartbeat baru → tetap syncing', async () => {
		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(repoRow({ status: 'syncing', sync_started_at: staleStart }));
		(repoQueries.countIndexedFiles as jest.Mock).mockResolvedValue(new Map());
		const stale = await codebaseStatusUseCase({ idProject: 1, userId: 10, userLevel: 'ADMIN' });
		expect(stale.repos[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('Sync terputus') });

		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(repoRow({ status: 'syncing', sync_started_at: new Date().toISOString() }));
		const fresh = await codebaseStatusUseCase({ idProject: 1, userId: 10, userLevel: 'ADMIN' });
		expect(fresh.repos[0]).toMatchObject({ status: 'syncing', last_error: null });
	});

	it('Investigasi memicu ulang sync yang basi (juga untuk repo yang sudah pernah ter-index)', async () => {
		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(
			repoRow({ status: 'syncing', sync_started_at: staleStart, last_synced_at: '2026-10-12T05:00:00Z' })
		);
		await getProjectCodeContext(1, ['x']);
		expect(triggerRepoTargets).toHaveBeenCalledWith([
			expect.objectContaining({ repo_key: 'knittotextile/knitto-widget-chat' }),
			expect.objectContaining({ repo_key: 'knittotextile/knitto-api-chat' })
		]);
	});

	it('Investigasi tidak memicu ulang sync yang masih hidup', async () => {
		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(repoRow({ status: 'syncing', sync_started_at: new Date().toISOString() }));
		await getProjectCodeContext(1, ['x']);
		expect(triggerRepoTargets).not.toHaveBeenCalled();
	});
});

describe('getProjectCodeContext (Investigasi)', () => {
	it('repo belum ter-index → picu sync di background + catatan; repo gagal → alasan; yang siap dipakai mencari', async () => {
		(repoQueries.findRepoForTarget as jest.Mock).mockImplementation(async (key: string) =>
			key.endsWith('widget-chat') ? repoRow({ id_repo: 1, last_synced_at: '2026-10-12T05:00:00Z' }) : null
		);
		const result = await getProjectCodeContext(1, ['POST /messages 500']);
		expect(result.notes).toEqual([
			'knittotextile/knitto-api-chat@develop: index kode sedang dibangun, konteks kode belum tersedia untuk investigasi ini.'
		]);
		expect(triggerRepoTargets).toHaveBeenCalledWith([expect.objectContaining({ repo_key: 'knittotextile/knitto-api-chat' })]);
		expect(searchCodebaseChunksByVector).toHaveBeenCalledWith([1], '[0.1]', 3, 0.3);

		(repoQueries.findRepoForTarget as jest.Mock).mockResolvedValue(repoRow({ status: 'failed', last_error: 'Token GitHub tidak valid (401)' }));
		const failed = await getProjectCodeContext(1, ['x']);
		expect(failed.notes[0]).toContain('index kode gagal — Token GitHub tidak valid (401)');
	});

	it('project tanpa repo → catatan, tanpa memicu apa pun', async () => {
		(projectQueries.findProjectById as jest.Mock).mockResolvedValue({ ...project, repo_url: null, programs: [] });
		const result = await getProjectCodeContext(1, ['x']);
		expect(result).toEqual({ chunks: [], notes: [expect.stringContaining('Project belum punya repo')] });
		expect(triggerRepoTargets).not.toHaveBeenCalled();
	});
});
