import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '../../project/queries/project.queries';
import * as queries from '../queries/test-case.queries';
import { toTestCaseResponse } from '../domain/test-case.domain';
import type { TListTestCaseValidation } from '../test-case.request';

export const listTestCasesUseCase = async (ctx: {
	idProject: number;
	filter: TListTestCaseValidation;
}) => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');

	const page = ctx.filter.page ?? 1;
	const limit = ctx.filter.limit ?? 50;
	const offset = (page - 1) * limit;

	const filterOptions: queries.ITestCaseFilter = {
		search: ctx.filter.search,
		status: ctx.filter.status,
		feature: ctx.filter.feature,
		test_type: ctx.filter.test_type,
		limit,
		offset
	};

	const [items, total, summary] = await Promise.all([
		queries.findTestCasesByProject(ctx.idProject, filterOptions),
		queries.countTestCasesByProject(ctx.idProject, filterOptions),
		queries.getTestCaseSummaryByProject(ctx.idProject)
	]);

	return {
		items: items.map(toTestCaseResponse),
		total,
		page,
		limit,
		summary
	};
};
