import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';
import * as repo from '../repo/project.repo';

export const deactivateProjectUseCase = async (ctx: {
	userLevel: string | undefined;
	idProject: number;
}) => {
	domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);
	domain.assertProjectExists(await queries.findProjectById(ctx.idProject));

	await repo.setProjectActive(ctx.idProject, false);

	const updated = await queries.findProjectById(ctx.idProject);
	return domain.toProjectResponse(domain.assertProjectExists(updated));
};
