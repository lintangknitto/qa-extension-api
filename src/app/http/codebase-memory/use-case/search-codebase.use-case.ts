import { findProjectById } from '@/app/http/project/queries/project.queries';
import { assertProjectExists, assertCanManageSpecificProject } from '@/app/http/project/domain/project.domain';
import embeddingService from '@/libs/services/embedding.service';
import { searchCodebaseChunksByVector, searchCodebaseSymbols } from '../queries/codebase.queries';
import type { TSearchCodebaseBodyValidation } from '../codebase.request';

export interface ISearchCodebaseItem {
	chunk_id: number;
	file_id: number;
	file_path: string;
	chunk_type: string;
	content: string;
	start_line: number;
	end_line: number;
	similarity: number;
	similarity_percentage: number;
	metadata: Record<string, unknown>;
}

export const searchCodebaseUseCase = async (
	data: TSearchCodebaseBodyValidation & { id_project: number; userId: number; userLevel?: string }
): Promise<{
	query: string;
	project_id: number;
	total_results: number;
	items: ISearchCodebaseItem[];
	matched_symbols?: Entity.IQaCodebaseSymbol[];
}> => {
	const project = await findProjectById(data.id_project);
	assertProjectExists(project);
	assertCanManageSpecificProject(data.userLevel, data.userId, project);

	const limit = data.limit ?? 10;
	const threshold = data.similarity_threshold ?? 0.3;

	// 1. Generate query embedding
	const queryVector = await embeddingService.generateEmbedding(data.query);
	const vectorStr = embeddingService.formatVectorForPg(queryVector);

	// 2. Vector Cosine Similarity Search
	const chunkResults = await searchCodebaseChunksByVector(
		data.id_project,
		vectorStr,
		limit,
		threshold
	);

	// 3. Exact / Keyword Symbol Search fallback/supplement
	const matchedSymbols = await searchCodebaseSymbols(data.id_project, data.query, data.kind, 5);

	const items: ISearchCodebaseItem[] = chunkResults.map((r) => ({
		chunk_id: r.id_chunk,
		file_id: r.id_file,
		file_path: r.file_path,
		chunk_type: r.chunk_type,
		content: r.content,
		start_line: r.start_line,
		end_line: r.end_line,
		similarity: Number(r.similarity.toFixed(4)),
		similarity_percentage: Number((r.similarity * 100).toFixed(2)),
		metadata: r.metadata || {}
	}));

	return {
		query: data.query,
		project_id: data.id_project,
		total_results: items.length,
		items,
		matched_symbols: matchedSymbols
	};
};
