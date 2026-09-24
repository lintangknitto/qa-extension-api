import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '../../project/queries/project.queries';
import * as repo from '../repo/test-case.repo';
import * as queries from '../queries/test-case.queries';
import type { TCreateTestCaseValidation } from '../test-case.request';

export const importTestCasesUseCase = async (ctx: {
	idProject: number;
	items: TCreateTestCaseValidation[];
	userId?: number;
}) => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');

	const result = await repo.bulkUpsertTestCases(ctx.idProject, ctx.items, ctx.userId);
	const summary = await queries.getTestCaseSummaryByProject(ctx.idProject);

	return {
		result,
		summary
	};
};
