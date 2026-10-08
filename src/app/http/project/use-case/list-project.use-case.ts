import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TListProjectValidation } from '../project.request';
import * as domain from '../domain/project.domain';
import * as queries from '../queries/project.queries';

const resolveActiveFilter = (
	isActive: TListProjectValidation['is_active']
): boolean | undefined => {
	if (isActive === 'true') return true;
	if (isActive === 'false') return false;
	return undefined;
};

export const listProjectsUseCase = async (ctx: {
	userLevel: string | undefined;
	userId?: number;
	input: TListProjectValidation;
}) => {
	domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);
	const { page, perPage, offset } = domain.normalizePagination(ctx.input.page, ctx.input.perPage);
	const isActive = resolveActiveFilter(ctx.input.is_active);
	const isGlobalAdmin = domain.canManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);

	const [rows, total] = await Promise.all([
		queries.listProjects({
			offset,
			perPage,
			search: ctx.input.search,
			idProgram: ctx.input.id_program,
			isActive,
			userId: ctx.userId,
			isGlobalAdmin
		}),
		queries.countProjects({
			search: ctx.input.search,
			idProgram: ctx.input.id_program,
			isActive,
			userId: ctx.userId,
			isGlobalAdmin
		})
	]);

	return {
		items: rows.map(domain.toProjectResponse),
		pagination: { page, perPage, total }
	};
};

/**
 * Daftar project aktif untuk tester — disaring sesuai assigned project user kecuali Superadmin/Admin.
 */
export const listActiveProjectsUseCase = async (ctx: {
	userId?: number;
	userLevel?: string;
	input: TListProjectValidation;
}) => {
	const { page, perPage, offset } = domain.normalizePagination(ctx.input.page, ctx.input.perPage);
	const isGlobalAdmin = ctx.userLevel ? ['SUPERADMIN', 'ADMIN'].includes(ctx.userLevel.toUpperCase()) : false;

	const [rows, total] = await Promise.all([
		queries.listActiveProjects({
			offset,
			perPage,
			search: ctx.input.search,
			idProgram: ctx.input.id_program,
			userId: ctx.userId,
			isGlobalAdmin
		}),
		queries.countActiveProjects({
			search: ctx.input.search,
			idProgram: ctx.input.id_program,
			userId: ctx.userId,
			isGlobalAdmin
		})
	]);

	return {
		items: rows.map(domain.toProjectResponse),
		pagination: { page, perPage, total }
	};
};
