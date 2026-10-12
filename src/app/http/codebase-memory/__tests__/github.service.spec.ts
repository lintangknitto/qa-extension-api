import { GitHubService } from '../services/github.service';

describe('GitHubService', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	it('parseRepoUrl mengekstrak owner dan repo dari berbagai format URL', () => {
		const service = new GitHubService();

		expect(service.parseRepoUrl('https://github.com/knittotextile/knitto-portal')).toEqual({
			owner: 'knittotextile',
			repo: 'knitto-portal'
		});

		expect(service.parseRepoUrl('knittotextile/knitto-portal.git')).toEqual({
			owner: 'knittotextile',
			repo: 'knitto-portal'
		});

		expect(service.parseRepoUrl('knittotextile/knitto-core')).toEqual({
			owner: 'knittotextile',
			repo: 'knitto-core'
		});
	});

	it('listRepositoryCodeFiles memfilter hanya file kode .ts, .tsx, .js, .jsx dan mengabaikan node_modules', async () => {
		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				tree: [
					{ path: 'src/index.ts', type: 'blob', size: 100 },
					{ path: 'src/App.tsx', type: 'blob', size: 200 },
					{ path: 'node_modules/pkg/index.js', type: 'blob', size: 300 },
					{ path: 'README.md', type: 'blob', size: 400 },
					{ path: 'src/utils', type: 'tree' }
				]
			})
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new GitHubService('test-token');
		const files = await service.listRepositoryCodeFiles('knittotextile', 'knitto-portal', 'main');

		expect(files).toHaveLength(2);
		expect(files.map((f) => f.path)).toEqual(['src/index.ts', 'src/App.tsx']);
	});

	it('fetchFileContent mendecode base64 string dari API GitHub', async () => {
		const sampleCode = 'export const greeting = "hello";';
		const base64Code = Buffer.from(sampleCode).toString('base64');

		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				content: base64Code,
				encoding: 'base64'
			})
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new GitHubService('test-token');
		const content = await service.fetchFileContent('knittotextile', 'knitto-portal', 'src/hello.ts');

		expect(content).toBe(sampleCode);
	});

	it('getBranchHeadSha & getDefaultBranch memakai token dari GITHUB_TOKEN sebagai Bearer', async () => {
		const mockFetch = jest
			.fn()
			.mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: 'main' }) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'abc123' }) });
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new GitHubService('org-token');
		expect(await service.getDefaultBranch('knittotextile', 'knitto-widget-chat')).toBe('main');
		expect(await service.getBranchHeadSha('knittotextile', 'knitto-widget-chat', 'feature/x')).toBe('abc123');
		expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/repos/knittotextile/knitto-widget-chat');
		expect(mockFetch.mock.calls[1][0]).toBe('https://api.github.com/repos/knittotextile/knitto-widget-chat/commits/feature%2Fx');
		expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer org-token');
	});

	it('repo public: tanpa token tidak mengirim Authorization', async () => {
		const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sha: 'def456' }) });
		global.fetch = mockFetch as unknown as typeof fetch;
		const service = new GitHubService('');
		Object.assign(service, { defaultToken: '' });
		await service.getBranchHeadSha('octocat', 'hello-world', 'master');
		expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
	});

	it.each([
		[401, 'Token GitHub tidak valid atau kedaluwarsa (401)'],
		[403, 'rate limit'],
		[404, 'tidak punya akses ke repo private'],
		[500, 'GitHub API error 500']
	])('status %s dipetakan ke pesan jelas tanpa membocorkan token', async (status, message) => {
		global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => 'detail' }) as unknown as typeof fetch;
		const service = new GitHubService('ghs_rahasia_sekali');
		const error = await service.getBranchHeadSha('knittotextile', 'knitto-widget-chat', 'main').catch((e: Error) => e);
		expect((error as Error).message).toContain(message);
		expect((error as Error).message).not.toContain('ghs_rahasia_sekali');
		const treeError = await service.listRepositoryCodeFiles('knittotextile', 'knitto-widget-chat', 'main').catch((e: Error) => e);
		expect((treeError as Error).message).toContain(message);
	});
});
