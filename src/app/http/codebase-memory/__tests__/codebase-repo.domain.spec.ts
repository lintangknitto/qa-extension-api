import { assertRepoUrlAllowed, isRepoKeyAllowed, normalizeRepoKey, resolveProjectRepoTargets } from '../domain/codebase-repo.domain';

describe('codebase-repo.domain', () => {
	it.each([
		['https://github.com/KnittoTextile/Knitto-Widget-Chat', 'knittotextile/knitto-widget-chat'],
		['https://github.com/knittotextile/knitto-widget-chat.git', 'knittotextile/knitto-widget-chat'],
		['https://github.com/knittotextile/knitto-widget-chat/', 'knittotextile/knitto-widget-chat'],
		['git@github.com:knittotextile/knitto-api-chat.git', 'knittotextile/knitto-api-chat'],
		['knittotextile/knitto-api-chat', 'knittotextile/knitto-api-chat']
	])('normalizeRepoKey(%s) = %s', (url, key) => {
		expect(normalizeRepoKey(url)).toBe(key);
	});

	it.each(['https://gitlab.com/a/b', 'bukan repo', ''])('normalizeRepoKey menolak %s', (url) => {
		expect(normalizeRepoKey(url)).toBeNull();
	});

	it('repo project = repo program (branch per program), duplikat repo+branch digabung', () => {
		const targets = resolveProjectRepoTargets({
			repo_url: 'https://github.com/knittotextile/project-lama',
			programs: [
				{ name: 'Widget', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', repo_branch: '' },
				{ name: 'Widget Lama', repo_url: 'knittotextile/Knitto-Widget-Chat.git', repo_branch: null },
				{ name: 'API', repo_url: 'https://github.com/knittotextile/knitto-api-chat', repo_branch: ' develop ' },
				{ name: 'Tanpa repo', repo_url: null }
			]
		});
		expect(targets).toEqual([
			{ repo_key: 'knittotextile/knitto-widget-chat', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', branch: null, program: 'Widget' },
			{ repo_key: 'knittotextile/knitto-api-chat', repo_url: 'https://github.com/knittotextile/knitto-api-chat', branch: 'develop', program: 'API' }
		]);
	});

	it('tanpa program ber-repo: fallback projects.repo_url dengan default branch', () => {
		expect(resolveProjectRepoTargets({ repo_url: 'https://github.com/knittotextile/knitto-widget-chat', programs: [{ name: 'X', repo_url: null }] })).toEqual([
			{ repo_key: 'knittotextile/knitto-widget-chat', repo_url: 'https://github.com/knittotextile/knitto-widget-chat', branch: null, program: null }
		]);
		expect(resolveProjectRepoTargets({ repo_url: null, programs: [] })).toEqual([]);
	});
});

describe('allowlist owner GitHub (4.7)', () => {
	it('default GITHUB_ALLOWED_OWNERS = knittotextile', () => {
		expect(isRepoKeyAllowed('knittotextile/knitto-widget-chat')).toBe(true);
		expect(isRepoKeyAllowed('other/secret')).toBe(false);
		expect(isRepoKeyAllowed('other/secret', ['other'])).toBe(true);
	});

	it('repo_url input di luar allowlist ditolak; kosong/null diterima', () => {
		expect(() => assertRepoUrlAllowed('https://github.com/KnittoTextile/x.git')).not.toThrow();
		expect(() => assertRepoUrlAllowed(null)).not.toThrow();
		expect(() => assertRepoUrlAllowed('')).not.toThrow();
		expect(() => assertRepoUrlAllowed('https://github.com/other/secret')).toThrow('tidak diizinkan');
		expect(() => assertRepoUrlAllowed('https://gitlab.com/knittotextile/x')).toThrow('tidak valid');
	});

	it('target repo project melewati repo di luar allowlist (data lama tidak pernah di-index)', () => {
		const targets = resolveProjectRepoTargets({
			repo_url: 'knittotextile/fallback',
			programs: [{ name: 'Asing', repo_url: 'https://github.com/other/secret', repo_branch: null }]
		});
		expect(targets.map((t) => t.repo_key)).toEqual(['knittotextile/fallback']);
	});
});
