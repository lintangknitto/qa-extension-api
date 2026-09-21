import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TUpdateProjectValidation } from '../project.request';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';
import * as repo from '../repo/project.repo';

export const updateProjectUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idProject: number;
	input: TUpdateProjectValidation;
}) => {
	domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const current = domain.assertProjectExists(await queries.findProjectById(ctx.idProject));

	let nextCode: string | undefined;
	if (ctx.input.code !== undefined) {
		nextCode = domain.resolveProjectCode(ctx.input.name ?? current.name ?? '', ctx.input.code);
	} else if (ctx.input.name !== undefined) {
		nextCode = domain.resolveProjectCode(ctx.input.name, current.code);
	}

	if (nextCode !== undefined && nextCode !== current.code) {
		const duplicate = await queries.findProjectByCode(nextCode);
		if (duplicate) throw new InvalidParameterException('Kode project sudah dipakai.');
	}

	await repo.updateProject(ctx.idProject, {
		name: ctx.input.name,
		code: nextCode,
		description: ctx.input.description,
		baseUrl: ctx.input.base_url,
		isActive: ctx.input.is_active
	});

	const updated = await queries.findProjectById(ctx.idProject);
	return domain.toProjectResponse(domain.assertProjectExists(updated));
};
