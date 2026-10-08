import type { TListProgramValidation } from '../program.request';
import * as domain from '../domain/program.domain';
import * as queries from '../queries/program.queries';

const parseIsActive = (val?: string): boolean | undefined => {
	if (val === 'true') return true;
	if (val === 'false') return false;
	return undefined;
};

export const listProgramsUseCase = async (ctx: {
	userId?: number;
	userLevel?: string;
	input: TListProgramValidation;
}) => {
	const { page, perPage, offset } = domain.normalizePagination(ctx.input.page, ctx.input.perPage);

	const filter: queries.IProgramFilter = {
		search: ctx.input.search?.trim() || undefined,
		isActive: parseIsActive(ctx.input.is_active)
	};

	const [programs, total] = await Promise.all([
		queries.listPrograms({
			offset,
			perPage,
			search: filter.search,
			isActive: filter.isActive
		}),
		queries.countPrograms(filter)
	]);

	return {
		page,
		perPage,
		total,
		items: programs.map(domain.toProgramResponse)
	};
};

export const listActiveProgramsUseCase = async (ctx?: {
	userId?: number;
	userLevel?: string;
	input?: TListProgramValidation;
}) => {
	const search = ctx?.input?.search?.trim() || undefined;
	const perPage = ctx?.input?.perPage ? Math.max(5, Number(ctx.input.perPage)) : 500;
	const offset = ctx?.input?.page ? Math.max(0, Number(ctx.input.page)) * perPage : 0;

	const [programs, total] = await Promise.all([
		queries.listActivePrograms({ offset, perPage, search }),
		queries.countActivePrograms({ search })
	]);

	return {
		total,
		items: programs.map(domain.toProgramResponse)
	};
};
