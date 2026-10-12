import type { TUpdateProjectValidation } from '../project.request';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';
import * as repo from '../repo/project.repo';
import { assertRepoUrlAllowed, resolveProjectRepoTargets } from '@/app/http/codebase-memory/domain/codebase-repo.domain';
import { triggerProjectRepoIndex } from '@/app/http/codebase-memory/services/auto-index.service';

const repoSignature = (project: Entity.IQaProject): string =>
	resolveProjectRepoTargets(project)
		.map((t) => `${t.repo_key}@${t.branch ?? ''}`)
		.sort()
		.join(',');

export const updateProjectUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idProject: number;
	input: TUpdateProjectValidation;
}) => {
	assertRepoUrlAllowed(ctx.input.repo_url);
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

	const updated = domain.assertProjectExists(await queries.findProjectById(ctx.idProject));
	// Tautan program / repo_url berubah → index repo project di background.
	if (repoSignature(updated) !== repoSignature(current)) triggerProjectRepoIndex(updated);
	return domain.toProjectResponse(updated);
};
