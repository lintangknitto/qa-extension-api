import postgresConnection from '@/libs/config/postgresConnection';
import { STALE_SYNC_MINUTES } from '../domain/codebase-repo.domain';

export { STALE_SYNC_MINUTES };

type TRepoRow = Entity.IQaCodebaseRepo;

const first = (rows: TRepoRow[]): TRepoRow | null => (rows[0] ? { ...rows[0], id_repo: Number(rows[0].id_repo) } : null);

/** Daftarkan repo+branch eksplisit (idempotent). */
export const upsertBranchRepo = async (repoKey: string, repoUrl: string, branch: string): Promise<TRepoRow> => {
	const rows = await postgresConnection.raw<TRepoRow[]>(
		`INSERT INTO codebase_repos (repo_key, repo_url, branch) VALUES ($1, $2, $3)
		ON CONFLICT (repo_key, branch) DO UPDATE SET updated_at = codebase_repos.updated_at
		RETURNING *`,
		[repoKey, repoUrl, branch]
	);
	return first(rows);
};

/**
 * Tandai baris repo+branch sebagai "default branch repo". Bila ada baris default lama dengan branch lain
 * (default berubah) atau placeholder branch kosong, penanda dipindah ke baris ini dan placeholder dihapus.
 */
export const markDefaultBranchRepo = async (repoKey: string, repoUrl: string, branch: string): Promise<TRepoRow> => {
	await postgresConnection.raw(
		'DELETE FROM codebase_repos WHERE repo_key = $1 AND tracks_default AND branch = \'\'',
		[repoKey]
	);
	await postgresConnection.raw(
		'UPDATE codebase_repos SET tracks_default = FALSE WHERE repo_key = $1 AND tracks_default AND branch <> $2',
		[repoKey, branch]
	);
	const rows = await postgresConnection.raw<TRepoRow[]>(
		`INSERT INTO codebase_repos (repo_key, repo_url, branch, tracks_default) VALUES ($1, $2, $3, TRUE)
		ON CONFLICT (repo_key, branch) DO UPDATE SET tracks_default = TRUE, updated_at = CURRENT_TIMESTAMP
		RETURNING *`,
		[repoKey, repoUrl, branch]
	);
	return first(rows);
};

/** Default branch belum bisa di-resolve (mis. token salah): simpan placeholder agar errornya terlihat di status. */
export const upsertUnresolvedDefaultRepo = async (repoKey: string, repoUrl: string, error: string): Promise<TRepoRow> => {
	const rows = await postgresConnection.raw<TRepoRow[]>(
		`INSERT INTO codebase_repos (repo_key, repo_url, branch, tracks_default, status, last_error, last_checked_at)
		VALUES ($1, $2, '', TRUE, 'failed', $3, CURRENT_TIMESTAMP)
		ON CONFLICT (repo_key, branch) DO UPDATE SET status = 'failed', last_error = EXCLUDED.last_error,
			last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		RETURNING *`,
		[repoKey, repoUrl, error]
	);
	return first(rows);
};

/**
 * Ambil hak menjalankan sync (atomik): gagal bila repo sedang `syncing` dan belum basi.
 * Mengembalikan baris terbaru atau null bila sync lain sedang berjalan.
 */
export const claimRepoSync = async (idRepo: number): Promise<TRepoRow | null> => {
	const rows = await postgresConnection.raw<TRepoRow[]>(
		`UPDATE codebase_repos SET status = 'syncing', sync_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id_repo = $1
		  AND (status <> 'syncing' OR sync_started_at IS NULL OR sync_started_at < CURRENT_TIMESTAMP - ($2 || ' minutes')::interval)
		RETURNING *`,
		[idRepo, String(STALE_SYNC_MINUTES)]
	);
	return first(rows);
};

/** Heartbeat sync yang sedang berjalan: perbarui `sync_started_at` agar tidak dianggap basi. */
export const touchRepoSync = async (idRepo: number): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE codebase_repos SET sync_started_at = CURRENT_TIMESTAMP WHERE id_repo = $1 AND status = \'syncing\'',
		[idRepo]
	);
};

export const markRepoSynced = async (idRepo: number, sha: string | null): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE codebase_repos SET status = 'idle', last_indexed_sha = $2, last_error = NULL,
			last_synced_at = CURRENT_TIMESTAMP, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id_repo = $1`,
		[idRepo, sha]
	);
};

export const markRepoUnchanged = async (idRepo: number): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE codebase_repos SET status = 'idle', last_error = NULL, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id_repo = $1`,
		[idRepo]
	);
};

export const markRepoFailed = async (idRepo: number, error: string): Promise<void> => {
	await postgresConnection.raw(
		`UPDATE codebase_repos SET status = 'failed', last_error = $2, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id_repo = $1`,
		[idRepo, error.slice(0, 1000)]
	);
};
