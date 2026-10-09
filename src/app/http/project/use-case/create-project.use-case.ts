import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TCreateProjectValidation } from '../project.request';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';
import * as repo from '../repo/project.repo';

export const createProjectUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	input: TCreateProjectValidation;
}) => {
	domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const code = domain.resolveProjectCode(ctx.input.name, ctx.input.code);
	const existing = await queries.findProjectByCode(code);
	if (existing) throw new InvalidParameterException('Kode project sudah dipakai.');

	const programIds = Array.isArray(ctx.input.program_ids) && ctx.input.program_ids.length > 0
		? ctx.input.program_ids
		: ctx.input.id_program
			? [Number(ctx.input.id_program)]
			: [];
	const primaryProgramId = programIds[0] ?? (ctx.input.id_program ? Number(ctx.input.id_program) : null);

	const idProject = await repo.insertProject({
		name: ctx.input.name,
		code,
		idProgram: primaryProgramId,
		programIds,
		description: ctx.input.description ?? null,
		baseUrl: ctx.input.base_url ?? null,
		repoUrl: ctx.input.repo_url ?? null,
		isActive: ctx.input.is_active ?? true,
		createdByUserId: ctx.userId,
		metadata: domain.pickProjectMetadata(ctx.input)
	});

	const created = await queries.findProjectById(idProject);
	return domain.toProjectResponse(domain.assertProjectExists(created));
};
