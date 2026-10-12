jest.mock('@/libs/config/postgresConnection', () => ({ __esModule: true, default: { raw: jest.fn() } }));
jest.mock('../services/repo-sync.service', () => ({
	requestRepoSync: jest.fn(),
	resolveRepoRow: jest.fn(),
	triggerRepoTargets: jest.fn()
}));

import postgresConnection from '@/libs/config/postgresConnection';
import { requestRepoSync, resolveRepoRow, triggerRepoTargets } from '../services/repo-sync.service';
import {
	listActiveRepoTargets,
	runAutoSyncTick,
	runAutoSyncTickGuarded,
	startAutoIndexJob,
	triggerProgramRepoIndex
} from '../services/auto-index.service';

const raw = postgresConnection.raw as jest.Mock;

beforeEach(() => {
	jest.clearAllMocks();
	raw.mockResolvedValueOnce([
		{ name: 'Widget', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', repo_branch: null },
		{ name: 'API', repo_url: 'https://github.com/knittotextile/knitto-api-chat', repo_branch: 'develop' },
		{ name: 'Widget 2', repo_url: 'knittotextile/knitto-widget-chat', repo_branch: '' }
	]);
	raw.mockResolvedValueOnce([{ repo_url: 'https://github.com/knittotextile/legacy-app' }]);
	(resolveRepoRow as jest.Mock).mockImplementation(async (t: { repo_key: string; branch: string | null }) => ({
		id_repo: t.repo_key.length,
		repo_key: t.repo_key,
		branch: t.branch ?? 'main'
	}));
});

describe('auto-index.service', () => {
	it('repo aktif = repo program aktif + fallback projects.repo_url, tanpa duplikat repo+branch', async () => {
		expect((await listActiveRepoTargets()).map((t) => `${t.repo_key}@${t.branch ?? ''}`)).toEqual([
			'knittotextile/knitto-widget-chat@',
			'knittotextile/knitto-api-chat@develop',
			'knittotextile/legacy-app@'
		]);
	});

	it('tick: setiap repo aktif diminta sync (yang SHA-nya sama dilewati di requestRepoSync), hasil dihitung', async () => {
		(requestRepoSync as jest.Mock)
			.mockResolvedValueOnce({ status: 'unchanged' })
			.mockResolvedValueOnce({ status: 'synced' })
			.mockResolvedValueOnce({ status: 'failed' });
		expect(await runAutoSyncTick()).toEqual({ checked: 3, synced: 1, failed: 1 });
		expect(requestRepoSync).toHaveBeenCalledTimes(3);
	});

	it('tick: default branch belum ter-resolve dihitung gagal tanpa sync', async () => {
		(resolveRepoRow as jest.Mock).mockResolvedValue({ id_repo: 1, repo_key: 'x', branch: '' });
		expect(await runAutoSyncTick()).toEqual({ checked: 3, synced: 0, failed: 3 });
		expect(requestRepoSync).not.toHaveBeenCalled();
	});

	it('tick tidak tumpang tindih', async () => {
		let release: () => void = () => undefined;
		(requestRepoSync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ status: 'synced' }))));
		(requestRepoSync as jest.Mock).mockResolvedValue({ status: 'unchanged' });
		const first = runAutoSyncTickGuarded();
		await new Promise((resolve) => setImmediate(resolve));
		expect(await runAutoSyncTickGuarded()).toBe(false);
		release();
		expect(await first).toBe(true);
	});

	it('interval 0 → job berkala mati (tidak query apa pun)', () => {
		raw.mockReset();
		startAutoIndexJob(0)();
		expect(raw).not.toHaveBeenCalled();
	});

	it('interval > 0 → tick langsung lalu berkala', async () => {
		jest.useFakeTimers();
		(requestRepoSync as jest.Mock).mockResolvedValue({ status: 'unchanged' });
		const stop = startAutoIndexJob(30);
		await jest.advanceTimersByTimeAsync(0);
		expect(raw).toHaveBeenCalledTimes(2);
		raw.mockResolvedValue([]);
		await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
		expect(raw).toHaveBeenCalledTimes(4);
		stop();
		jest.useRealTimers();
	});

	it('program nonaktif tidak memicu index', () => {
		triggerProgramRepoIndex({ name: 'X', repo_url: 'knittotextile/x', repo_branch: null, is_active: false });
		expect(triggerRepoTargets).not.toHaveBeenCalled();
		triggerProgramRepoIndex({ name: 'X', repo_url: 'knittotextile/x', repo_branch: null, is_active: true });
		expect(triggerRepoTargets).toHaveBeenCalledWith([{ repo_key: 'knittotextile/x', repo_url: 'knittotextile/x', branch: null, program: 'X' }]);
	});
});
