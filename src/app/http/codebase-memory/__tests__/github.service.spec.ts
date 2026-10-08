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
});
