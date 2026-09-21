import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';

export const detailProjectUseCase = async (ctx: {
	userLevel: string | undefined;
	idProject: number;
}) => {
	const project = domain.assertProjectExists(await queries.findProjectById(ctx.idProject));

	// Project non-aktif hanya boleh dilihat QA/admin.
	if (project.is_active !== 1) domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	return domain.toProjectResponse(project);
};
