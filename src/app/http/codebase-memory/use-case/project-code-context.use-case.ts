import { findProjectById } from '@/app/http/project/queries/project.queries';
import embeddingService from '@/libs/services/embedding.service';
import { searchCodebaseChunksByVector } from '../queries/codebase.queries';
import { listProjectRepos, indexedRepoIds, type IProjectRepo } from '../services/project-repos.service';
import { triggerRepoTargets } from '../services/repo-sync.service';
import { isSyncStale } from '../domain/codebase-repo.domain';

/** Potongan kode paling mirip dengan kata kunci (sinyal kegagalan, log) dari index repo yang diberikan. */
export const findMatchingCodeContext = async (
	repoIds: number[],
	keywords: string[]
): Promise<Array<{ file_path: string; start_line: number; end_line: number; similarity: number; content: string }>> => {
	if (keywords.length === 0 || repoIds.length === 0) return [];

	const combinedQuery = keywords.slice(0, 3).join(' ');
	try {
		const queryVector = await embeddingService.generateEmbedding(combinedQuery);
		const vectorStr = embeddingService.formatVectorForPg(queryVector);
		const chunks = await searchCodebaseChunksByVector(repoIds, vectorStr, 3, 0.3);

		return chunks.map((chunk) => ({
			file_path: chunk.file_path,
			start_line: chunk.start_line,
			end_line: chunk.end_line,
			similarity: Number(chunk.similarity.toFixed(4)),
			content: chunk.content
		}));
	} catch {
		return [];
	}
};

export interface IProjectCodeContext {
	chunks: Awaited<ReturnType<typeof findMatchingCodeContext>>;
	/** Catatan status index per repo yang belum siap (ditulis di laporan, bukan "tidak ada potongan kode"). */
	notes: string[];
}

/** Catatan status satu repo + apakah sync perlu dipicu (belum ter-index, atau sync basi/terputus). */
const assessRepo = ({ target, repo }: IProjectRepo): { note: string | null; trigger: boolean } => {
	const label = `${target.repo_key}${target.branch ? `@${target.branch}` : repo?.branch ? `@${repo.branch}` : ''}`;
	const stale = repo ? isSyncStale(repo) : false;
	if (repo?.status === 'failed') return { note: `${label}: index kode gagal — ${repo.last_error ?? 'alasan tidak diketahui'}`, trigger: false };
	if (!repo?.last_synced_at) {
		return {
			note: `${label}: index kode sedang dibangun, konteks kode belum tersedia untuk investigasi ini.`,
			trigger: repo?.status !== 'syncing' || stale
		};
	}
	return { note: null, trigger: stale };
};

/**
 * Konteks kode untuk Investigasi dari index semua repo project. Repo yang belum ter-index dipicu sync
 * di background (Investigasi tidak menunggu) dan dicatat statusnya.
 */
export const getProjectCodeContext = async (idProject: number, keywords: string[]): Promise<IProjectCodeContext> => {
	const project = await findProjectById(idProject);
	if (!project) return { chunks: [], notes: [] };
	const repos = await listProjectRepos(project);
	if (repos.length === 0) return { chunks: [], notes: ['Project belum punya repo (isi repo_url di program atau project) — konteks kode tidak tersedia.'] };

	const notes: string[] = [];
	const toTrigger = [];
	for (const item of repos) {
		const { note, trigger } = assessRepo(item);
		if (note) notes.push(note);
		if (trigger) toTrigger.push(item.target);
	}
	if (toTrigger.length > 0) triggerRepoTargets(toTrigger);

	return { chunks: await findMatchingCodeContext(indexedRepoIds(repos), keywords), notes };
};
