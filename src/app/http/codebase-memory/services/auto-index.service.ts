import { logger } from '@knittotextile/knitto-core-backend';
import postgresConnection from '@/libs/config/postgresConnection';
import { codebaseAutoSyncConfig } from '@/libs/config';
import { errorMessage, resolveProjectRepoTargets, type IRepoTarget } from '../domain/codebase-repo.domain';
import { requestRepoSync, resolveRepoRow, triggerRepoTargets } from './repo-sync.service';

/** Program dengan repo baru/berubah → index di background. */
export const triggerProgramRepoIndex = (program: Pick<Entity.IQaProgram, 'name' | 'repo_url' | 'repo_branch' | 'is_active'>): void => {
	if (program.is_active === false || program.is_active === 0) return;
	triggerRepoTargets(resolveProjectRepoTargets({ programs: [program] }));
};

/** Project dibuat/diubah (tautan program atau repo_url) → index repo-nya di background. */
export const triggerProjectRepoIndex = (project: Parameters<typeof resolveProjectRepoTargets>[0]): void => {
	triggerRepoTargets(resolveProjectRepoTargets(project));
};

/**
 * Repo yang masih dipakai: repo program aktif, plus `projects.repo_url` milik project yang tidak punya
 * program ber-repo (fallback). Repo yang tidak dipakai lagi tidak dicek.
 */
export const listActiveRepoTargets = async (): Promise<IRepoTarget[]> => {
	const programs = await postgresConnection.raw<Array<{ name: string; repo_url: string; repo_branch: string | null }>>(
		'SELECT name, repo_url, repo_branch FROM programs WHERE is_active AND COALESCE(TRIM(repo_url), \'\') <> \'\''
	);
	const projects = await postgresConnection.raw<Array<{ repo_url: string }>>(
		`SELECT p.repo_url FROM projects p
		WHERE COALESCE(TRIM(p.repo_url), '') <> ''
		  AND NOT EXISTS (
			SELECT 1 FROM project_programs pp JOIN programs prg ON prg.id_program = pp.id_program
			WHERE pp.id_project = p.id_project AND COALESCE(TRIM(prg.repo_url), '') <> ''
		  )`
	);
	const targets: IRepoTarget[] = [];
	const add = (list: IRepoTarget[]) => {
		for (const t of list) if (!targets.some((x) => x.repo_key === t.repo_key && x.branch === t.branch)) targets.push(t);
	};
	add(resolveProjectRepoTargets({ programs }));
	for (const project of projects) add(resolveProjectRepoTargets({ repo_url: project.repo_url }));
	return targets;
};

/**
 * Satu putaran cek berkala: per repo aktif ambil SHA head; sama → hanya `last_checked_at`, beda → sync
 * incremental. Repo diproses berurutan agar tidak membanjiri GitHub/embedding.
 */
export const runAutoSyncTick = async (): Promise<{ checked: number; synced: number; failed: number }> => {
	const result = { checked: 0, synced: 0, failed: 0 };
	for (const target of await listActiveRepoTargets()) {
		try {
			const row = await resolveRepoRow(target);
			result.checked++;
			if (row.branch === '') {
				result.failed++;
				continue;
			}
			const outcome = await requestRepoSync(Number(row.id_repo));
			if (outcome.status === 'synced') result.synced++;
			if (outcome.status === 'failed') result.failed++;
		} catch (err: unknown) {
			result.failed++;
			logger.warn(`[codebase] cek berkala ${target.repo_key} gagal: ${errorMessage(err)}`);
		}
	}
	return result;
};

let timer: NodeJS.Timeout | null = null;
let tickRunning = false;

/** Tick tidak tumpang tindih: tick yang jatuh saat tick sebelumnya masih jalan dilewati. */
export const runAutoSyncTickGuarded = async (): Promise<boolean> => {
	if (tickRunning) return false;
	tickRunning = true;
	try {
		const result = await runAutoSyncTick();
		logger.info(`[codebase] cek berkala: ${result.checked} repo dicek, ${result.synced} di-sync, ${result.failed} gagal`);
		return true;
	} catch (err: unknown) {
		logger.warn(`[codebase] cek berkala gagal: ${errorMessage(err)}`);
		return true;
	} finally {
		tickRunning = false;
	}
};

/** Mulai job berkala (dipanggil saat server start). Tick pertama langsung jalan agar repo baru segera ter-index. */
export const startAutoIndexJob = (intervalMinutes = codebaseAutoSyncConfig.INTERVAL_MINUTES): (() => void) => {
	if (intervalMinutes <= 0) {
		logger.info('[codebase] auto-index berkala dimatikan (CODEBASE_AUTO_SYNC_INTERVAL_MINUTES=0).');
		return () => undefined;
	}
	stopAutoIndexJob();
	void runAutoSyncTickGuarded();
	timer = setInterval(() => void runAutoSyncTickGuarded(), intervalMinutes * 60 * 1000);
	timer.unref?.();
	return stopAutoIndexJob;
};

export const stopAutoIndexJob = (): void => {
	if (timer) clearInterval(timer);
	timer = null;
};
