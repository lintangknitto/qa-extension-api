import { NotAuthorizationException, InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '@/app/http/project/queries/project.queries';
import { assertProjectExists, assertCanManageSpecificProject } from '@/app/http/project/domain/project.domain';
import { assertRepoUrlAllowed, errorMessage, normalizeRepoKey, resolveProjectRepoTargets, type IRepoTarget } from '../domain/codebase-repo.domain';
import githubService from '../services/github.service';
import { indexLocalDirectory, type IIndexStats } from '../services/codebase-indexer.service';
import { createSyncHeartbeat, requestRepoSync, resolveRepoRow, type IRepoSyncOutcome } from '../services/repo-sync.service';
import { claimRepoSync, markRepoFailed, markRepoSynced } from '../repo/codebase-repo.repo';
import type { TSyncCodebaseBodyValidation } from '../codebase.request';

export interface ISyncCodebaseResult {
	project_name: string;
	/** `false` = sync berjalan di background; status lihat `GET .../codebase/status`. */
	completed: boolean;
	repos: Array<Pick<IRepoSyncOutcome, 'id_repo' | 'repo_key' | 'branch'> & Partial<IRepoSyncOutcome> & { local_stats?: IIndexStats }>;
}

/** Level yang boleh meng-index salinan lokal (`base_dir`) lewat HTTP. */
const LOCAL_INDEX_LEVELS = ['ADMIN', 'SUPERADMIN'];

/**
 * Branch dari body hanya diterima bila sama dengan branch efektif target (branch program, atau default
 * branch repo untuk target tanpa branch) — index dipakai bersama, jadi branch arbitrer tidak boleh ditulis.
 */
const assertBranchAllowed = async (target: IRepoTarget, branch: string): Promise<void> => {
	if (target.branch !== null) {
		if (target.branch === branch) return;
	} else {
		const { owner, repo } = githubService.parseRepoUrl(target.repo_url);
		if ((await githubService.getDefaultBranch(owner, repo)) === branch) return;
	}
	throw new NotAuthorizationException(`Branch "${branch}" bukan branch ${target.repo_key} yang dipakai project ini.`);
};

/**
 * Repo yang disync: dari body (`repo_url` + `branch`), atau semua repo project. Pemanggil HTTP hanya boleh
 * menyebut repo/branch milik project; CLI (`trusted`) bebas memilih repo/branch.
 */
const resolveTargets = async (data: TSyncCodebaseBodyValidation, project: Entity.IQaProject, trusted: boolean): Promise<IRepoTarget[]> => {
	const projectTargets = resolveProjectRepoTargets(project);
	const branch = data.branch?.trim() || null;
	let targets: IRepoTarget[];
	if (data.repo_url) {
		const repoKey = normalizeRepoKey(data.repo_url);
		if (!repoKey) throw new InvalidParameterException(`URL repository GitHub tidak valid: "${data.repo_url}".`);
		if (trusted) {
			assertRepoUrlAllowed(data.repo_url);
			return [{ repo_key: repoKey, repo_url: data.repo_url.trim(), branch, program: null }];
		}
		targets = projectTargets.filter((t) => t.repo_key === repoKey);
		if (targets.length === 0) throw new NotAuthorizationException(`Repository ${repoKey} bukan repo project ini.`);
		if (branch) {
			const exact = targets.find((t) => t.branch === branch);
			targets = [exact ?? targets.find((t) => t.branch === null) ?? targets[0]];
		}
	} else {
		targets = projectTargets;
	}
	if (targets.length === 0) {
		throw new InvalidParameterException('Project belum punya repo: isi repo_url di program yang ditautkan atau di project.');
	}
	if (!branch) return targets;
	if (!trusted) for (const target of targets) await assertBranchAllowed(target, branch);
	return targets.map((t) => ({ ...t, branch }));
};

/**
 * Salinan lokal (`base_dir`, CLI) di-index ke repo yang sama dengan GitHub agar dipakai bersama.
 * SHA tidak diketahui → dikosongkan sehingga sync GitHub berikutnya merekonsiliasi (incremental per hash).
 */
const syncLocalCopy = async (target: IRepoTarget, baseDir: string, force: boolean) => {
	const row = await resolveRepoRow(target);
	if (row.branch === '') throw new InvalidParameterException(`Branch ${target.repo_key} tidak bisa ditentukan: ${row.last_error ?? ''}`);
	const claimed = await claimRepoSync(Number(row.id_repo));
	if (!claimed) return { id_repo: Number(row.id_repo), repo_key: row.repo_key, branch: row.branch, status: 'busy' as const };
	try {
		const localStats = await indexLocalDirectory(claimed.id_repo, baseDir, force, createSyncHeartbeat(claimed.id_repo));
		await markRepoSynced(claimed.id_repo, null);
		return { id_repo: claimed.id_repo, repo_key: claimed.repo_key, branch: claimed.branch, status: 'synced' as const, local_stats: localStats };
	} catch (err: unknown) {
		await markRepoFailed(claimed.id_repo, errorMessage(err));
		throw err;
	}
};

export const syncCodebaseUseCase = async (
	data: TSyncCodebaseBodyValidation & {
		id_project: number;
		userId?: number;
		userLevel?: string;
		/** `true` = tunggu sync selesai (CLI). Default: jalan di background. */
		wait?: boolean;
		/** `true` hanya untuk CLI server (`scripts/index-codebase.ts`): tanpa cek user, repo/branch/base_dir bebas. */
		trusted?: boolean;
	}
): Promise<ISyncCodebaseResult> => {
	const project = await findProjectById(data.id_project);
	assertProjectExists(project);
	const trusted = data.trusted === true;
	if (!trusted) assertCanManageSpecificProject(data.userLevel, data.userId, project);
	if (data.base_dir && !trusted && !LOCAL_INDEX_LEVELS.includes(String(data.userLevel ?? '').toUpperCase())) {
		throw new NotAuthorizationException('Index salinan lokal (base_dir) hanya untuk ADMIN/SUPERADMIN.');
	}
	const projectRow = project;
	const targets = await resolveTargets(data, projectRow, trusted);
	const force = Boolean(data.force_reindex);
	const projectName = String(projectRow.name ?? '');

	if (data.base_dir) {
		if (targets.length !== 1) {
			throw new InvalidParameterException('Project punya lebih dari satu repo: sertakan repo_url untuk salinan lokal yang di-index.');
		}
		return { project_name: projectName, completed: true, repos: [await syncLocalCopy(targets[0], data.base_dir, force)] };
	}

	const rows = await Promise.all(targets.map((target) => resolveRepoRow(target)));
	const runs = rows.map((row) =>
		row.branch === ''
			? Promise.resolve<IRepoSyncOutcome>({ id_repo: Number(row.id_repo), repo_key: row.repo_key, branch: '', status: 'failed', error: row.last_error ?? undefined })
			: requestRepoSync(Number(row.id_repo), { force })
	);
	if (data.wait) return { project_name: projectName, completed: true, repos: await Promise.all(runs) };

	// Background: error sudah tercatat di status repo.
	runs.forEach((run) => void run.catch(() => undefined));
	return {
		project_name: projectName,
		completed: false,
		repos: rows.map((row) => ({ id_repo: Number(row.id_repo), repo_key: row.repo_key, branch: row.branch }))
	};
};
