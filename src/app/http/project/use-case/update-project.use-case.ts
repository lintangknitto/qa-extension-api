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
	const current = domain.assertProjectExists(await queries.findProjectById(ctx.idProject));
	domain.assertCanManageSpecificProject(ctx.userLevel, ctx.userId, current);

	await repo.updateProject(ctx.idProject, {
		name: ctx.input.name,
		description: ctx.input.description,
		baseUrl: ctx.input.base_url,
		isActive: ctx.input.is_active
	});

	const updated = await queries.findProjectById(ctx.idProject);
	return domain.toProjectResponse(domain.assertProjectExists(updated));
};
