import postgresConnection from '@/libs/config/postgresConnection';

type TRepoRow = Entity.IQaCodebaseRepo;

const normalize = (row: TRepoRow): TRepoRow => ({ ...row, id_repo: Number(row.id_repo) });

export const findRepoById = async (idRepo: number): Promise<TRepoRow | null> => {
	const rows = await postgresConnection.raw<TRepoRow[]>('SELECT * FROM codebase_repos WHERE id_repo = $1', [idRepo]);
	return rows[0] ? normalize(rows[0]) : null;
};

/** Baris repo untuk target: branch eksplisit, atau baris "default branch" bila branch null. */
export const findRepoForTarget = async (repoKey: string, branch: string | null): Promise<TRepoRow | null> => {
	const rows =
		branch === null
			? await postgresConnection.raw<TRepoRow[]>('SELECT * FROM codebase_repos WHERE repo_key = $1 AND tracks_default', [repoKey])
			: await postgresConnection.raw<TRepoRow[]>('SELECT * FROM codebase_repos WHERE repo_key = $1 AND branch = $2', [repoKey, branch]);
	return rows[0] ? normalize(rows[0]) : null;
};

/** Repo yang masih dipakai program/project (untuk job berkala). Repo yatim tidak dicek lagi. */
export const listAllRepos = async (): Promise<TRepoRow[]> => {
	const rows = await postgresConnection.raw<TRepoRow[]>('SELECT * FROM codebase_repos ORDER BY id_repo ASC');
	return rows.map(normalize);
};

export const countIndexedFiles = async (idRepos: number[]): Promise<Map<number, number>> => {
	if (idRepos.length === 0) return new Map();
	const rows = await postgresConnection.raw<Array<{ id_repo: number | string; n: number | string }>>(
		'SELECT id_repo, count(*) AS n FROM codebase_files WHERE id_repo = ANY($1) GROUP BY id_repo',
		[idRepos]
	);
	return new Map(rows.map((r) => [Number(r.id_repo), Number(r.n)]));
};
