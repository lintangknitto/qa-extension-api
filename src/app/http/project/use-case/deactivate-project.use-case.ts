import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';
import * as repo from '../repo/project.repo';

export const deactivateProjectUseCase = async (ctx: {
	userId?: number;
	userLevel: string | undefined;
	idProject: number;
}) => {
	const current = domain.assertProjectExists(await queries.findProjectById(ctx.idProject));
	domain.assertCanManageSpecificProject(ctx.userLevel, ctx.userId, current);

	const associatedCount = await queries.countProjectAssociatedData(ctx.idProject);

	if (associatedCount > 0) {
		await repo.setProjectActive(ctx.idProject, false);
		const updated = await queries.findProjectById(ctx.idProject);
		return {
			id_project: ctx.idProject,
			success: true,
			deleted: false,
			deactivated: true,
			message: 'Project memiliki riwayat data sehingga dinonaktifkan.',
			project: updated ? domain.toProjectResponse(updated) : null
		};
	}

	await repo.deleteProjectPermanently(ctx.idProject);
	return {
		id_project: ctx.idProject,
		success: true,
		deleted: true,
		deactivated: false,
		message: 'Project berhasil dihapus secara permanen.',
		project: null
	};
};
