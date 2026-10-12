import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { findProjectById } from '@/app/http/project/queries/project.queries';
import { assertCanManageProjects, assertProjectExists, canManageSpecificProject } from '@/app/http/project/domain/project.domain';
import { countIndexedFiles } from '../queries/codebase-repo.queries';
import { listProjectRepos, type IProjectRepo } from '../services/project-repos.service';
import { isRepoSyncRunning } from '../services/repo-sync.service';
import { isSyncStale } from '../domain/codebase-repo.domain';

export type TRepoIndexStatus = 'not_indexed' | 'syncing' | 'idle' | 'failed';

export interface ICodebaseRepoStatus {
	repo: string;
	repo_url: string;
	/** Branch yang di-index (default branch repo bila program tidak mengisi branch). */
	branch: string | null;
	tracks_default_branch: boolean;
	program: string | null;
	status: TRepoIndexStatus;
	last_indexed_sha: string | null;
	last_synced_at: string | Date | null;
	last_checked_at: string | Date | null;
	last_error: string | null;
	files_indexed: number;
}

const repoStatus = (repo: Entity.IQaCodebaseRepo | null): TRepoIndexStatus => {
	if (!repo) return 'not_indexed';
	if (isRepoSyncRunning(Number(repo.id_repo))) return 'syncing';
	if (isSyncStale(repo)) return 'failed';
	if (repo.status === 'syncing') return 'syncing';
	if (repo.status === 'failed') return 'failed';
	return repo.last_synced_at ? 'idle' : 'not_indexed';
};

export const STALE_SYNC_ERROR = 'Sync terputus (tidak ada kemajuan) — klik "Sync sekarang" untuk mengulang.';

const lastError = (repo: Entity.IQaCodebaseRepo | null): string | null => {
	if (!repo) return null;
	if (repoStatus(repo) !== 'failed') return null;
	return repo.status === 'syncing' ? STALE_SYNC_ERROR : repo.last_error;
};

const toRepoStatus = ({ target, repo }: IProjectRepo, counts: Map<number, number>): ICodebaseRepoStatus => ({
	repo: target.repo_key,
	repo_url: target.repo_url,
	branch: target.branch ?? (repo?.branch || null),
	tracks_default_branch: target.branch === null,
	program: target.program,
	status: repoStatus(repo),
	last_indexed_sha: repo?.last_indexed_sha ?? null,
	last_synced_at: repo?.last_synced_at ?? null,
	last_checked_at: repo?.last_checked_at ?? null,
	last_error: lastError(repo),
	files_indexed: repo ? counts.get(Number(repo.id_repo)) ?? 0 : 0
});

/** Status index kode per repo project. Akses sama dengan melihat project; `can_sync` = boleh memicu sync. */
export const codebaseStatusUseCase = async (ctx: { idProject: number; userId?: number; userLevel?: string }) => {
	const project = assertProjectExists(await findProjectById(ctx.idProject));
	const isActive = project.is_active === true || project.is_active === 1;
	if (!isActive) assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const repos = await listProjectRepos(project);
	const counts = await countIndexedFiles(repos.flatMap((r) => (r.repo ? [Number(r.repo.id_repo)] : [])));
	const items = repos.map((item) => toRepoStatus(item, counts));

	return {
		id_project: Number(project.id_project),
		can_sync: canManageSpecificProject(ctx.userLevel, ctx.userId, project),
		repos: items
	};
};
