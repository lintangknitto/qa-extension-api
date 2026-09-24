import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '../../project/queries/project.queries';
import * as repo from '../repo/test-case.repo';
import * as queries from '../queries/test-case.queries';
import { assertTestCaseExists, toTestCaseResponse } from '../domain/test-case.domain';
import type { TCreateTestCaseValidation } from '../test-case.request';

export const createTestCaseUseCase = async (ctx: {
	idProject: number;
	input: TCreateTestCaseValidation;
	userId?: number;
}) => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');

	const idTestCase = await repo.insertTestCase(ctx.idProject, ctx.input, ctx.userId);
	const created = assertTestCaseExists(await queries.findTestCaseById(idTestCase));
	return toTestCaseResponse(created);
};
