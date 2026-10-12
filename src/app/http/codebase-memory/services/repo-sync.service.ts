import { logger } from '@knittotextile/knitto-core-backend';
import githubService from './github.service';
import { indexGitHubRepo, type IIndexStats } from './codebase-indexer.service';
import { errorMessage, isRepoKeyAllowed, SYNC_HEARTBEAT_MS, type IRepoTarget } from '../domain/codebase-repo.domain';
import { findRepoById } from '../queries/codebase-repo.queries';
import {
	claimRepoSync,
	markDefaultBranchRepo,
	markRepoFailed,
	markRepoSynced,
	markRepoUnchanged,
	touchRepoSync,
	upsertBranchRepo,
	upsertUnresolvedDefaultRepo
} from '../repo/codebase-repo.repo';

export type TSyncOutcomeStatus = 'synced' | 'unchanged' | 'busy' | 'failed';

export interface IRepoSyncOutcome {
	id_repo: number;
	repo_key: string;
	branch: string;
	status: TSyncOutcomeStatus;
	sha?: string;
	error?: string;
	stats?: IIndexStats;
}

/**
 * Baris `codebase_repos` untuk target (dibuat bila belum ada). Target tanpa branch memakai default branch
 * repo; bila default branch tidak bisa di-resolve, dibuat placeholder `failed` agar errornya terlihat.
 */
export const resolveRepoRow = async (target: Pick<IRepoTarget, 'repo_key' | 'repo_url' | 'branch'>): Promise<Entity.IQaCodebaseRepo> => {
	if (target.branch) return upsertBranchRepo(target.repo_key, target.repo_url, target.branch);
	try {
		const { owner, repo } = githubService.parseRepoUrl(target.repo_url);
		const defaultBranch = await githubService.getDefaultBranch(owner, repo);
		return await markDefaultBranchRepo(target.repo_key, target.repo_url, defaultBranch);
	} catch (err: unknown) {
		return upsertUnresolvedDefaultRepo(target.repo_key, target.repo_url, errorMessage(err));
	}
};

/** Heartbeat ter-throttle untuk sync yang sedang berjalan; kegagalan heartbeat tidak menggagalkan sync. */
export const createSyncHeartbeat = (idRepo: number, intervalMs: number = SYNC_HEARTBEAT_MS): (() => Promise<void>) => {
	let last = Date.now();
	return async () => {
		if (Date.now() - last < intervalMs) return;
		last = Date.now();
		await touchRepoSync(idRepo).catch((err: unknown) => logger.warn(`[codebase] heartbeat sync repo ${idRepo} gagal: ${errorMessage(err)}`));
	};
};

/** Satu putaran sync: lewati bila SHA head sama dengan yang terakhir di-index (kecuali `force`). */
const syncOnce = async (idRepo: number, force: boolean): Promise<IRepoSyncOutcome> => {
	let row = await findRepoById(idRepo);
	if (!row) return { id_repo: idRepo, repo_key: '', branch: '', status: 'failed', error: 'Repo tidak terdaftar.' };
	if (!isRepoKeyAllowed(row.repo_key)) {
		const error = `Repository ${row.repo_key} di luar GITHUB_ALLOWED_OWNERS — tidak di-sync.`;
		await markRepoFailed(idRepo, error);
		return { id_repo: idRepo, repo_key: row.repo_key, branch: row.branch, status: 'failed', error };
	}
	// Placeholder default branch: coba resolve ulang (mis. token sudah diperbaiki).
	if (row.branch === '') {
		const resolved = await resolveRepoRow({ repo_key: row.repo_key, repo_url: row.repo_url, branch: null });
		if (resolved.branch === '') {
			return { id_repo: idRepo, repo_key: row.repo_key, branch: '', status: 'failed', error: resolved.last_error ?? undefined };
		}
		row = { ...resolved, id_repo: Number(resolved.id_repo) };
	}

	const base = { id_repo: row.id_repo, repo_key: row.repo_key, branch: row.branch };
	const claimed = await claimRepoSync(row.id_repo);
	if (!claimed) return { ...base, status: 'busy' };

	try {
		const { owner, repo } = githubService.parseRepoUrl(claimed.repo_url);
		const sha = await githubService.getBranchHeadSha(owner, repo, claimed.branch);
		if (!force && claimed.last_indexed_sha === sha) {
			await markRepoUnchanged(claimed.id_repo);
			return { ...base, status: 'unchanged', sha };
		}
		const stats = await indexGitHubRepo(claimed.id_repo, claimed.repo_url, sha, force, createSyncHeartbeat(claimed.id_repo));
		await markRepoSynced(claimed.id_repo, sha);
		logger.info(`[codebase] ${claimed.repo_key}@${claimed.branch} ter-index @${sha.slice(0, 7)}: ${stats.files_indexed} file di-index, ${stats.files_skipped} tidak berubah`);
		return { ...base, status: 'synced', sha, stats };
	} catch (err: unknown) {
		const error = errorMessage(err);
		await markRepoFailed(claimed.id_repo, error);
		logger.warn(`[codebase] sync ${claimed.repo_key}@${claimed.branch} gagal: ${error}`);
		return { ...base, status: 'failed', error };
	}
};

interface IRunningSync {
	promise: Promise<IRepoSyncOutcome>;
	rerun: boolean;
	force: boolean;
}

const running = new Map<number, IRunningSync>();

/**
 * Minta sync satu repo. Bila sync repo itu sedang berjalan di proses ini, permintaan digabung:
 * satu putaran ulang dijalankan setelah selesai (bukan antre berkali-kali), dan promise yang sama dikembalikan.
 */
export const requestRepoSync = (idRepo: number, options: { force?: boolean } = {}): Promise<IRepoSyncOutcome> => {
	const current = running.get(idRepo);
	if (current) {
		current.rerun = true;
		current.force = current.force || Boolean(options.force);
		return current.promise;
	}
	const entry: IRunningSync = { promise: Promise.resolve(null as unknown as IRepoSyncOutcome), rerun: false, force: Boolean(options.force) };
	entry.promise = (async () => {
		try {
			let outcome: IRepoSyncOutcome;
			do {
				const force = entry.force;
				entry.rerun = false;
				entry.force = false;
				outcome = await syncOnce(idRepo, force);
			} while (entry.rerun);
			return outcome;
		} finally {
			running.delete(idRepo);
		}
	})();
	running.set(idRepo, entry);
	return entry.promise;
};

/** Untuk test: apakah ada sync berjalan untuk repo ini di proses ini. */
export const isRepoSyncRunning = (idRepo: number): boolean => running.has(idRepo);

/**
 * Daftarkan repo target lalu picu sync di background (tanpa menunggu). Tidak pernah melempar ke pemanggil:
 * kegagalan tercatat di status repo dan log.
 */
export const triggerRepoTargets = (targets: IRepoTarget[], options: { force?: boolean } = {}): void => {
	for (const target of targets) {
		void resolveRepoRow(target)
			.then((row) => (row.branch === '' ? undefined : requestRepoSync(Number(row.id_repo), options)))
			.catch((err: unknown) => logger.warn(`[codebase] gagal memicu sync ${target.repo_key}: ${errorMessage(err)}`));
	}
};
