import { githubConfig } from '@/libs/config';
import { GeneralException, InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export interface IGitHubRepoInfo {
	owner: string;
	repo: string;
}

/**
 * Pesan error GitHub yang bisa ditindaklanjuti tanpa membocorkan token. 404 juga dipakai GitHub
 * untuk repo private yang tidak bisa diakses token.
 */
export const describeGitHubStatus = (status: number, target: string): string => {
	if (status === 401) return `Token GitHub tidak valid atau kedaluwarsa (401) saat mengakses ${target}. Perbarui GITHUB_TOKEN di server.`;
	if (status === 403) return `Akses GitHub ditolak atau rate limit tercapai (403) saat mengakses ${target}.`;
	if (status === 404) return `Repo atau branch ${target} tidak ditemukan, atau GITHUB_TOKEN tidak punya akses ke repo private ini (404).`;
	return `GitHub API error ${status} saat mengakses ${target}.`;
};

export interface IGitHubTreeItem {
	path: string;
	sha: string;
	size?: number;
	type: 'blob' | 'tree';
}

export class GitHubService {
	private readonly defaultToken: string;

	constructor(token?: string) {
		this.defaultToken = token || githubConfig.TOKEN;
	}

	public parseRepoUrl(rawUrl: string): IGitHubRepoInfo {
		const trimmed = rawUrl.trim().replace(/\.git$/, '');
		// Handle https://github.com/owner/repo or git@github.com:owner/repo or owner/repo
		const match = trimmed.match(/(?:github\.com[/:])?([^/]+)\/([^/]+)$/);
		if (!match) {
			throw new InvalidParameterException(
				`URL atau nama repository GitHub tidak valid: "${rawUrl}". Format yang diharapkan: "owner/repo" atau "https://github.com/owner/repo".`
			);
		}
		return {
			owner: match[1],
			repo: match[2]
		};
	}

	private headers(customToken?: string): Record<string, string> {
		const token = customToken || this.defaultToken;
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'Knitto-Codebase-Memory-Sync'
		};
		if (token && !token.startsWith('ghp_placeholder')) headers['Authorization'] = `Bearer ${token}`;
		return headers;
	}

	private async getJson<T>(endpoint: string, target: string, customToken?: string): Promise<T> {
		let res: Response;
		try {
			res = await fetch(endpoint, { method: 'GET', headers: this.headers(customToken) });
		} catch (err: unknown) {
			throw new GeneralException(`Gagal menghubungi GitHub (${target}): ${(err as Error).message}`);
		}
		if (!res.ok) throw new GeneralException(describeGitHubStatus(res.status, target));
		return (await res.json()) as T;
	}

	/** Default branch repo (mis. `main`). */
	public async getDefaultBranch(owner: string, repo: string, customToken?: string): Promise<string> {
		const data = await this.getJson<{ default_branch?: string }>(
			`${githubConfig.API_BASE_URL}/repos/${owner}/${repo}`,
			`${owner}/${repo}`,
			customToken
		);
		if (!data.default_branch) throw new GeneralException(`Default branch ${owner}/${repo} tidak diketahui.`);
		return data.default_branch;
	}

	/** SHA commit terakhir sebuah branch — dipakai untuk melewati sync bila repo tidak berubah. */
	public async getBranchHeadSha(owner: string, repo: string, branch: string, customToken?: string): Promise<string> {
		const data = await this.getJson<{ sha?: string }>(
			`${githubConfig.API_BASE_URL}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
			`${owner}/${repo}@${branch}`,
			customToken
		);
		if (!data.sha) throw new GeneralException(`SHA commit ${owner}/${repo}@${branch} tidak diketahui.`);
		return data.sha;
	}

	public async listRepositoryCodeFiles(
		owner: string,
		repo: string,
		branch = 'main',
		customToken?: string
	): Promise<IGitHubTreeItem[]> {
		const token = customToken || this.defaultToken;
		const endpoint = `${githubConfig.API_BASE_URL}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'Knitto-Codebase-Memory-Sync'
		};

		if (token && !token.startsWith('ghp_placeholder')) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		try {
			const res = await fetch(endpoint, { method: 'GET', headers });
			if (!res.ok) {
				throw new GeneralException(describeGitHubStatus(res.status, `${owner}/${repo}@${branch}`));
			}

			const data = (await res.json()) as { tree?: Array<{ path: string; sha: string; type: string; size?: number }> };
			if (!data.tree || !Array.isArray(data.tree)) {
				return [];
			}

			const allowedExts = ['.ts', '.tsx', '.js', '.jsx'];
			const ignoredPrefixes = [
				'node_modules/',
				'dist/',
				'build/',
				'.next/',
				'.git/',
				'coverage/',
				'test-results/'
			];

			return data.tree
				.filter((item) => item.type === 'blob')
				.filter((item) => allowedExts.some((ext) => item.path.endsWith(ext)))
				.filter((item) => !ignoredPrefixes.some((prefix) => item.path.startsWith(prefix) || item.path.includes(`/${prefix}`)))
				.map((item) => ({
					path: item.path,
					sha: item.sha,
					size: item.size,
					type: 'blob' as const
				}));
		} catch (err: unknown) {
			if (err instanceof GeneralException || err instanceof InvalidParameterException) throw err;
			throw new GeneralException(
				`Gagal mengambil file tree dari GitHub (${owner}/${repo}@${branch}): ${(err as Error).message}`
			);
		}
	}

	public async fetchFileContent(
		owner: string,
		repo: string,
		filePath: string,
		branch = 'main',
		customToken?: string
	): Promise<string> {
		const token = customToken || this.defaultToken;
		const endpoint = `${githubConfig.API_BASE_URL}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'Knitto-Codebase-Memory-Sync'
		};

		if (token && !token.startsWith('ghp_placeholder')) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		try {
			const res = await fetch(endpoint, { method: 'GET', headers });
			if (!res.ok) {
				throw new GeneralException(`Gagal mengunduh file "${filePath}" dari GitHub: HTTP ${res.status}`);
			}

			const data = (await res.json()) as { content?: string; encoding?: string };
			if (!data.content) {
				return '';
			}

			if (data.encoding === 'base64') {
				return Buffer.from(data.content, 'base64').toString('utf-8');
			}

			return data.content;
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(
				`Gagal membaca konten file "${filePath}" dari GitHub: ${(err as Error).message}`
			);
		}
	}
}

export default new GitHubService();
