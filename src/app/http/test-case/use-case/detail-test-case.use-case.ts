import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '../../project/queries/project.queries';
import * as queries from '../queries/test-case.queries';
import { assertTestCaseExists, toTestCaseResponse } from '../domain/test-case.domain';

export const detailTestCaseUseCase = async (ctx: {
	idProject: number;
	idTestCase: number;
}) => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');

	const testCase = assertTestCaseExists(await queries.findTestCaseById(ctx.idTestCase));
	if (Number(testCase.id_project) !== ctx.idProject) {
		throw new NotFoundException('Test case tidak ditemukan pada project ini.');
	}

	return toTestCaseResponse(testCase);
};
