import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { findProjectById } from '../../project/queries/project.queries';
import * as repo from '../repo/test-case.repo';
import * as queries from '../queries/test-case.queries';
import { assertTestCaseExists, toTestCaseResponse } from '../domain/test-case.domain';
import type { TUpdateTestCaseValidation } from '../test-case.request';

export const updateTestCaseUseCase = async (ctx: {
	idProject: number;
	idTestCase: number;
	input: TUpdateTestCaseValidation;
}) => {
	const project = await findProjectById(ctx.idProject);
	if (!project) throw new NotFoundException('Project tidak ditemukan.');

	const existing = assertTestCaseExists(await queries.findTestCaseById(ctx.idTestCase));
	if (Number(existing.id_project) !== ctx.idProject) {
		throw new NotFoundException('Test case tidak ditemukan pada project ini.');
	}

	await repo.updateTestCase(ctx.idTestCase, ctx.input);
	const updated = assertTestCaseExists(await queries.findTestCaseById(ctx.idTestCase));
	return toTestCaseResponse(updated);
};
