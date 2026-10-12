import { resolveProjectRepoTargets, type IRepoTarget } from '../domain/codebase-repo.domain';
import { findRepoForTarget } from '../queries/codebase-repo.queries';

export interface IProjectRepo {
	target: IRepoTarget;
	/** null = repo belum pernah didaftarkan/di-index. */
	repo: Entity.IQaCodebaseRepo | null;
}

/** Repo project (program ber-repo / fallback `projects.repo_url`) beserta baris index-nya. */
export const listProjectRepos = async (project: Parameters<typeof resolveProjectRepoTargets>[0]): Promise<IProjectRepo[]> =>
	Promise.all(
		resolveProjectRepoTargets(project).map(async (target) => ({ target, repo: await findRepoForTarget(target.repo_key, target.branch) }))
	);

/** ID index repo project yang bisa dicari (sudah pernah ter-index). */
export const indexedRepoIds = (repos: IProjectRepo[]): number[] =>
	repos.filter((r) => r.repo?.last_synced_at).map((r) => Number(r.repo?.id_repo));
