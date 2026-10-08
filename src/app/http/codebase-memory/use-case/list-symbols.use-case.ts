import { findProjectById } from '@/app/http/project/queries/project.queries';
import { assertProjectExists, assertCanManageSpecificProject } from '@/app/http/project/domain/project.domain';
import { searchCodebaseSymbols } from '../queries/codebase.queries';
import type { TListSymbolsQueryValidation } from '../codebase.request';

export const listSymbolsUseCase = async (
	data: TListSymbolsQueryValidation & { id_project: number; userId: number; userLevel?: string }
): Promise<{
	project_id: number;
	total: number;
	items: Entity.IQaCodebaseSymbol[];
}> => {
	const project = await findProjectById(data.id_project);
	assertProjectExists(project);
	assertCanManageSpecificProject(data.userLevel, data.userId, project);

	const limit = data.limit ?? 50;
	const symbols = await searchCodebaseSymbols(data.id_project, data.search, data.kind, limit);

	return {
		project_id: data.id_project,
		total: symbols.length,
		items: symbols
	};
};
