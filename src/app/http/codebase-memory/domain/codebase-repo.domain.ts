import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { githubConfig } from '@/libs/config';

/**
 * Index codebase memory disimpan per repo+branch (`codebase_repos`), bukan per project: project yang
 * menautkan program dengan repo & branch sama memakai index yang sama.
 */

export interface IRepoTarget {
	/** `owner/repo` lowercase — kunci index. */
	repo_key: string;
	repo_url: string;
	/** Branch eksplisit; `null` = default branch repo di GitHub. */
	branch: string | null;
	/** Nama program asal repo (null = fallback `projects.repo_url`). */
	program: string | null;
}

/** `https://github.com/Owner/Repo.git`, `git@github.com:owner/repo`, `owner/repo` → `owner/repo` (lowercase). */
export const normalizeRepoKey = (rawUrl: string): string | null => {
	const trimmed = rawUrl
		.trim()
		.replace(/\.git$/i, '')
		.replace(/\/+$/, '');
	const match = /(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/i.exec(trimmed);
	if (!match) return null;
	// Hanya github.com atau bentuk pendek owner/repo.
	if (/^[a-z]+:\/\//i.test(trimmed) && !/^https?:\/\/(www\.)?github\.com\//i.test(trimmed)) return null;
	return `${match[1]}/${match[2]}`.toLowerCase();
};

/** Repo boleh di-index dengan token server hanya bila owner-nya ada di `GITHUB_ALLOWED_OWNERS`. */
export const isRepoKeyAllowed = (repoKey: string, allowedOwners: string[] = githubConfig.ALLOWED_OWNERS): boolean =>
	allowedOwners.includes(repoKey.split('/')[0]);

/** Validasi `repo_url` input program/project: owner di luar allowlist ditolak. Kosong/null diterima. */
export const assertRepoUrlAllowed = (rawUrl: string | null | undefined): void => {
	if (!rawUrl || !rawUrl.trim()) return;
	const repoKey = normalizeRepoKey(rawUrl);
	if (!repoKey) throw new InvalidParameterException(`URL repository GitHub tidak valid: "${rawUrl}".`);
	if (!isRepoKeyAllowed(repoKey)) {
		throw new InvalidParameterException(
			`Repository ${repoKey} tidak diizinkan: owner harus salah satu dari ${githubConfig.ALLOWED_OWNERS.join(', ') || '(kosong)'}.`
		);
	}
};

/** Pesan error untuk status/log (error non-Error tidak di-stringify mentah). */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'kesalahan tidak diketahui');

const cleanBranch = (branch: string | null | undefined): string | null => {
	const value = (branch ?? '').trim();
	return value.length > 0 ? value : null;
};

/**
 * Repo yang di-index untuk sebuah project: repo semua program yang ditautkan (branch per program);
 * bila tidak ada program ber-repo, fallback `projects.repo_url` dengan default branch.
 * Duplikat (repo+branch sama) digabung.
 */
export const resolveProjectRepoTargets = (project: {
	repo_url?: string | null;
	programs?: Array<{ name?: string | null; repo_url?: string | null; repo_branch?: string | null }> | null;
}): IRepoTarget[] => {
	const targets: IRepoTarget[] = [];
	const add = (repoUrl: string | null | undefined, branch: string | null, program: string | null) => {
		if (!repoUrl) return;
		const repoKey = normalizeRepoKey(repoUrl);
		// Repo di luar allowlist (mis. data lama) tidak pernah di-index atau dibaca.
		if (!repoKey || !isRepoKeyAllowed(repoKey)) return;
		if (targets.some((t) => t.repo_key === repoKey && t.branch === branch)) return;
		targets.push({ repo_key: repoKey, repo_url: repoUrl.trim(), branch, program });
	};
	for (const program of Array.isArray(project.programs) ? project.programs : []) {
		add(program.repo_url, cleanBranch(program.repo_branch), program.name ?? null);
	}
	if (targets.length === 0) add(project.repo_url, null, null);
	return targets;
};

/**
 * Sync `syncing` tanpa heartbeat lebih lama dari ini dianggap basi (mis. server restart di tengah sync) dan boleh diulang.
 * Sync yang masih berjalan memperbarui `sync_started_at` tiap `SYNC_HEARTBEAT_MS`, jadi sync sah yang lama tidak di-claim ganda.
 */
export const STALE_SYNC_MINUTES = 10;
export const SYNC_HEARTBEAT_MS = 60_000;

/** `true` bila baris `syncing` tapi heartbeat-nya sudah basi (sync terputus). */
export const isSyncStale = (repo: Pick<Entity.IQaCodebaseRepo, 'status' | 'sync_started_at'>, now: number = Date.now()): boolean => {
	if (repo.status !== 'syncing') return false;
	if (!repo.sync_started_at) return true;
	return now - new Date(repo.sync_started_at).getTime() > STALE_SYNC_MINUTES * 60_000;
};
