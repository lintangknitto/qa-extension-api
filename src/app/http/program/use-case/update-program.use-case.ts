import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TUpdateProgramValidation } from '../program.request';
import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';
import * as repo from '../repo/program.repo';

export const updateProgramUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idProgram: number;
	input: TUpdateProgramValidation;
}) => {
	domain.assertCanManagePrograms(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const existing = domain.assertProgramExists(await queries.findProgramById(ctx.idProgram));
	domain.assertCanManageSpecificProgram(ctx.userLevel, ctx.userId, existing);

	let codeToUpdate: string | undefined;
	if (ctx.input.code !== undefined && ctx.input.code.trim()) {
		codeToUpdate = domain.resolveProgramCode(ctx.input.name ?? existing.name ?? '', ctx.input.code);
		if (codeToUpdate !== existing.code) {
			const duplicate = await queries.findProgramByCode(codeToUpdate);
			if (duplicate && Number(duplicate.id_program) !== Number(ctx.idProgram)) {
				throw new InvalidParameterException('Kode program sudah dipakai.');
			}
		}
	}

	await repo.updateProgram(ctx.idProgram, {
		name: ctx.input.name,
		code: codeToUpdate,
		type: ctx.input.type,
		grafanaDashboardUrl: ctx.input.grafana_dashboard_url,
		description: ctx.input.description,
		baseUrl: ctx.input.base_url,
		repoUrl: ctx.input.repo_url,
		isActive: ctx.input.is_active
	});

	const updated = await queries.findProgramById(ctx.idProgram);
	return domain.toProgramResponse(domain.assertProgramExists(updated));
};
