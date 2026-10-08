import { githubConfig } from '@/libs/config';
import { GeneralException, InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export interface IGitHubRepoInfo {
	owner: string;
	repo: string;
}

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

	public async listRepositoryCodeFiles(
		owner: string,
		repo: string,
		branch = 'main',
		customToken?: string
	): Promise<IGitHubTreeItem[]> {
		const token = customToken || this.defaultToken;
		const endpoint = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

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
				const errText = await res.text();
				if (res.status === 401 || res.status === 403) {
					throw new GeneralException(
						`Akses GitHub private repo ditolak (${res.status}). Pastikan GITHUB_TOKEN telah dikonfigurasi dengan benar.`
					);
				}
				if (res.status === 404) {
					throw new GeneralException(
						`Repository atau branch "${owner}/${repo}@${branch}" tidak ditemukan di GitHub (404).`
					);
				}
				throw new GeneralException(`GitHub API error ${res.status}: ${errText}`);
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
		const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

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
