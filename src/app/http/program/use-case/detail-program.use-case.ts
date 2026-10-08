import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';

export const detailProgramUseCase = async (ctx: {
	userLevel?: string;
	idProgram: number;
}) => {
	const program = await queries.findProgramById(ctx.idProgram);
	const validProgram = domain.assertProgramExists(program);
	const projectCount = await queries.countProgramAssociatedProjects(ctx.idProgram);

	return domain.toProgramResponse({
		...validProgram,
		project_count: projectCount
	});
};
