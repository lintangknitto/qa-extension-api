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
	input: TListProjectValidation;
}) => {
	domain.assertCanManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);
	const { page, perPage, offset } = domain.normalizePagination(ctx.input.page, ctx.input.perPage);
	const isActive = resolveActiveFilter(ctx.input.is_active);

	const [rows, total] = await Promise.all([
		queries.listProjects({ offset, perPage, search: ctx.input.search, isActive }),
		queries.countProjects({ search: ctx.input.search, isActive })
	]);

	return {
		items: rows.map(domain.toProjectResponse),
		pagination: { page, perPage, total }
	};
};

/**
 * Daftar project aktif untuk tester — tersedia bagi semua user yang sudah login.
 */
export const listActiveProjectsUseCase = async (ctx: { input: TListProjectValidation }) => {
	const { page, perPage, offset } = domain.normalizePagination(ctx.input.page, ctx.input.perPage);

	const [rows, total] = await Promise.all([
		queries.listActiveProjects({ offset, perPage, search: ctx.input.search }),
		queries.countActiveProjects(ctx.input.search)
	]);

	return {
		items: rows.map(domain.toProjectResponse),
		pagination: { page, perPage, total }
	};
};
