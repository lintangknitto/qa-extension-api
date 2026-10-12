jest.mock('../services/github.service', () => ({
	__esModule: true,
	default: {
		parseRepoUrl: (url: string) => {
			const [owner, repo] = url.replace('https://github.com/', '').split('/');
			return { owner, repo };
		},
		getDefaultBranch: jest.fn(),
		getBranchHeadSha: jest.fn()
	}
}));
jest.mock('../services/codebase-indexer.service', () => ({ indexGitHubRepo: jest.fn() }));
jest.mock('../queries/codebase-repo.queries', () => ({ findRepoById: jest.fn() }));
jest.mock('../repo/codebase-repo.repo', () => ({
	claimRepoSync: jest.fn(),
	markDefaultBranchRepo: jest.fn(),
	markRepoFailed: jest.fn(),
	markRepoSynced: jest.fn(),
	markRepoUnchanged: jest.fn(),
	touchRepoSync: jest.fn().mockResolvedValue(undefined),
	upsertBranchRepo: jest.fn(),
	upsertUnresolvedDefaultRepo: jest.fn()
}));

import githubService from '../services/github.service';
import { indexGitHubRepo } from '../services/codebase-indexer.service';
import { findRepoById } from '../queries/codebase-repo.queries';
import * as repo from '../repo/codebase-repo.repo';
import { createSyncHeartbeat, isRepoSyncRunning, requestRepoSync, resolveRepoRow, triggerRepoTargets } from '../services/repo-sync.service';

const row = (extra: Partial<Entity.IQaCodebaseRepo> = {}): Entity.IQaCodebaseRepo => ({
	id_repo: 7,
	repo_key: 'knittotextile/knitto-widget-chat',
	repo_url: 'https://github.com/knittotextile/knitto-widget-chat',
	branch: 'main',
	last_indexed_sha: 'old-sha',
	status: 'idle',
	last_error: null,
	sync_started_at: null,
	last_synced_at: null,
	last_checked_at: null,
	...extra
});

const stats = { files_scanned: 3, files_indexed: 1, files_skipped: 2, chunks_indexed: 4 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
	jest.clearAllMocks();
	(findRepoById as jest.Mock).mockResolvedValue(row());
	(repo.claimRepoSync as jest.Mock).mockImplementation(async () => row());
	(githubService.getBranchHeadSha as jest.Mock).mockResolvedValue('new-sha');
	(indexGitHubRepo as jest.Mock).mockResolvedValue(stats);
});

describe('repo-sync.service', () => {
	it('repo terdaftar di luar allowlist owner (4.7) → failed tanpa request GitHub', async () => {
		(findRepoById as jest.Mock).mockResolvedValue(row({ repo_key: 'other/secret', repo_url: 'https://github.com/other/secret' }));
		const outcome = await requestRepoSync(7);
		expect(outcome).toMatchObject({ status: 'failed', error: expect.stringContaining('GITHUB_ALLOWED_OWNERS') });
		expect(repo.claimRepoSync).not.toHaveBeenCalled();
		expect(githubService.getBranchHeadSha).not.toHaveBeenCalled();
		expect(repo.markRepoFailed).toHaveBeenCalledWith(7, expect.stringContaining('other/secret'));
	});

	it('SHA head sama dengan index terakhir → dilewati tanpa unduh file (hanya 1 request GitHub)', async () => {
		(githubService.getBranchHeadSha as jest.Mock).mockResolvedValue('old-sha');
		const outcome = await requestRepoSync(7);
		expect(outcome).toMatchObject({ status: 'unchanged', sha: 'old-sha' });
		expect(indexGitHubRepo).not.toHaveBeenCalled();
		expect(repo.markRepoUnchanged).toHaveBeenCalledWith(7);
	});

	it('SHA baru → index incremental pada SHA itu lalu catat SHA', async () => {
		const outcome = await requestRepoSync(7);
		expect(indexGitHubRepo).toHaveBeenCalledWith(7, 'https://github.com/knittotextile/knitto-widget-chat', 'new-sha', false, expect.any(Function));
		expect(repo.markRepoSynced).toHaveBeenCalledWith(7, 'new-sha');
		expect(outcome).toMatchObject({ status: 'synced', sha: 'new-sha', stats });
	});

	it('force → index ulang walau SHA sama', async () => {
		(githubService.getBranchHeadSha as jest.Mock).mockResolvedValue('old-sha');
		await requestRepoSync(7, { force: true });
		expect(indexGitHubRepo).toHaveBeenCalledWith(7, expect.any(String), 'old-sha', true, expect.any(Function));
	});

	it('pemicu saat sync berjalan digabung: satu putaran ulang, bukan antre berkali-kali', async () => {
		let release: () => void = () => undefined;
		(indexGitHubRepo as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(stats))));
		const first = requestRepoSync(7);
		await flush();
		const second = requestRepoSync(7);
		const third = requestRepoSync(7);
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(isRepoSyncRunning(7)).toBe(true);
		release();
		await first;
		// Putaran awal + tepat satu putaran ulang.
		expect(repo.claimRepoSync).toHaveBeenCalledTimes(2);
		expect(isRepoSyncRunning(7)).toBe(false);
	});

	it('sync lain sedang berjalan (klaim DB gagal) → busy, tidak meng-index', async () => {
		(repo.claimRepoSync as jest.Mock).mockResolvedValue(null);
		expect(await requestRepoSync(7)).toMatchObject({ status: 'busy' });
		expect(githubService.getBranchHeadSha).not.toHaveBeenCalled();
	});

	it('error GitHub → status failed dengan pesan, tidak melempar', async () => {
		(githubService.getBranchHeadSha as jest.Mock).mockRejectedValue(new Error('Token GitHub tidak valid atau kedaluwarsa (401)'));
		const outcome = await requestRepoSync(7);
		expect(outcome).toMatchObject({ status: 'failed', error: 'Token GitHub tidak valid atau kedaluwarsa (401)' });
		expect(repo.markRepoFailed).toHaveBeenCalledWith(7, 'Token GitHub tidak valid atau kedaluwarsa (401)');
	});

	it('resolveRepoRow: branch eksplisit / default branch / default gagal di-resolve → placeholder failed', async () => {
		const target = { repo_key: 'knittotextile/knitto-widget-chat', repo_url: 'https://github.com/knittotextile/knitto-widget-chat' };
		await resolveRepoRow({ ...target, branch: 'develop' });
		expect(repo.upsertBranchRepo).toHaveBeenCalledWith(target.repo_key, target.repo_url, 'develop');

		(githubService.getDefaultBranch as jest.Mock).mockResolvedValueOnce('main');
		await resolveRepoRow({ ...target, branch: null });
		expect(repo.markDefaultBranchRepo).toHaveBeenCalledWith(target.repo_key, target.repo_url, 'main');

		(githubService.getDefaultBranch as jest.Mock).mockRejectedValueOnce(new Error('Token GitHub tidak valid (401)'));
		await resolveRepoRow({ ...target, branch: null });
		expect(repo.upsertUnresolvedDefaultRepo).toHaveBeenCalledWith(target.repo_key, target.repo_url, 'Token GitHub tidak valid (401)');
	});

	it('placeholder default branch di-resolve ulang saat sync (mis. token sudah diperbaiki)', async () => {
		(findRepoById as jest.Mock).mockResolvedValue(row({ id_repo: 9, branch: '', status: 'failed' }));
		(githubService.getDefaultBranch as jest.Mock).mockResolvedValue('main');
		(repo.markDefaultBranchRepo as jest.Mock).mockResolvedValue(row({ id_repo: 9 }));
		(repo.claimRepoSync as jest.Mock).mockResolvedValue(row({ id_repo: 9 }));
		expect(await requestRepoSync(9)).toMatchObject({ status: 'synced', branch: 'main' });
	});

	it('triggerRepoTargets tidak melempar dan tidak menunggu', async () => {
		(repo.upsertBranchRepo as jest.Mock).mockRejectedValue(new Error('DB mati'));
		expect(() => triggerRepoTargets([{ repo_key: 'a/b', repo_url: 'a/b', branch: 'main', program: null }])).not.toThrow();
		await flush();
	});
});

describe('createSyncHeartbeat (4.4)', () => {
	afterEach(() => jest.useRealTimers());

	it('memperbarui sync_started_at paling sering sekali per interval', async () => {
		jest.useFakeTimers({ now: 0 });
		const beat = createSyncHeartbeat(7, 60_000);
		await beat();
		expect(repo.touchRepoSync).not.toHaveBeenCalled();
		jest.setSystemTime(60_001);
		await beat();
		await beat();
		expect(repo.touchRepoSync).toHaveBeenCalledTimes(1);
		expect(repo.touchRepoSync).toHaveBeenCalledWith(7);
	});

	it('heartbeat gagal tidak menggagalkan sync', async () => {
		jest.useFakeTimers({ now: 0 });
		(repo.touchRepoSync as jest.Mock).mockRejectedValueOnce(new Error('db down'));
		const beat = createSyncHeartbeat(7, 1);
		jest.setSystemTime(10);
		await expect(beat()).resolves.toBeUndefined();
	});
});
