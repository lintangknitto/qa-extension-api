import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';
import * as repo from '../repo/program.repo';

export const deleteProgramUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idProgram: number;
}) => {
	domain.assertCanManagePrograms(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const existing = domain.assertProgramExists(await queries.findProgramById(ctx.idProgram));
	domain.assertCanManageSpecificProgram(ctx.userLevel, ctx.userId, existing);

	const associatedProjects = await queries.countProgramAssociatedProjects(ctx.idProgram);

	if (associatedProjects > 0) {
		await repo.setProgramActive(ctx.idProgram, false);
		return {
			success: true,
			action: 'deactivated',
			message: `Program dinonaktifkan karena masih memiliki ${associatedProjects} project terkait.`
		};
	}

	await repo.deleteProgramPermanently(ctx.idProgram);
	return {
		success: true,
		action: 'deleted',
		message: 'Program berhasil dihapus secara permanen.'
	};
};
