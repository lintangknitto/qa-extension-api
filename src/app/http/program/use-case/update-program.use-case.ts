import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TUpdateProgramValidation } from '../program.request';
import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';
import * as repo from '../repo/program.repo';
import { assertRepoUrlAllowed } from '@/app/http/codebase-memory/domain/codebase-repo.domain';
import { triggerProgramRepoIndex } from '@/app/http/codebase-memory/services/auto-index.service';

const repoChanged = (before: Entity.IQaProgram, after: Entity.IQaProgram): boolean =>
	(after.repo_url ?? null) !== (before.repo_url ?? null) || (after.repo_branch ?? null) !== (before.repo_branch ?? null);

export const updateProgramUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idProgram: number;
	input: TUpdateProgramValidation;
}) => {
	assertRepoUrlAllowed(ctx.input.repo_url);
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
		repoBranch: ctx.input.repo_branch === undefined ? undefined : ctx.input.repo_branch.trim() || null,
		isActive: ctx.input.is_active
	});

	const updated = domain.assertProgramExists(await queries.findProgramById(ctx.idProgram));
	// Repo/branch berubah → index kode di background.
	if (repoChanged(existing, updated)) triggerProgramRepoIndex(updated);
	return domain.toProgramResponse(updated);
};
