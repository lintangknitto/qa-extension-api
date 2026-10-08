import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TCreateProgramValidation } from '../program.request';
import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';
import * as repo from '../repo/program.repo';

export const createProgramUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	input: TCreateProgramValidation;
}) => {
	domain.assertCanManagePrograms(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const code = domain.resolveProgramCode(ctx.input.name, ctx.input.code);
	const existing = await queries.findProgramByCode(code);
	if (existing) throw new InvalidParameterException('Kode program sudah dipakai.');

	const idProgram = await repo.insertProgram({
		name: ctx.input.name,
		code,
		type: ctx.input.type,
		grafanaDashboardUrl: ctx.input.grafana_dashboard_url ?? null,
		description: ctx.input.description ?? null,
		baseUrl: ctx.input.base_url ?? null,
		repoUrl: ctx.input.repo_url ?? null,
		isActive: ctx.input.is_active ?? true,
		createdByUserId: ctx.userId
	});

	const created = await queries.findProgramById(idProgram);
	return domain.toProgramResponse(domain.assertProgramExists(created));
};
