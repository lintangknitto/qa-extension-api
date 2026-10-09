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

	const programIds = Array.isArray(ctx.input.program_ids)
		? ctx.input.program_ids
		: ctx.input.id_program !== undefined
			? ctx.input.id_program === null
				? []
				: [Number(ctx.input.id_program)]
			: undefined;

	await repo.updateProject(ctx.idProject, {
		name: ctx.input.name,
		idProgram:
			ctx.input.id_program !== undefined
				? ctx.input.id_program === null
					? null
					: Number(ctx.input.id_program)
				: programIds && programIds.length > 0
					? programIds[0]
					: undefined,
		programIds,
		description: ctx.input.description,
		baseUrl: ctx.input.base_url,
		repoUrl: ctx.input.repo_url,
		isActive: ctx.input.is_active,
		metadata: domain.pickProjectMetadata(ctx.input)
	});

	const updated = await queries.findProjectById(ctx.idProject);
	return domain.toProjectResponse(domain.assertProjectExists(updated));
};
