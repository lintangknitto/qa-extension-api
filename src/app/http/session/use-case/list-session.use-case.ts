import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import { canManageProjects } from '@/libs/helpers/access';
import { normalizePagination } from '@/libs/helpers/pagination';
import type { TListSessionValidation } from '../session.request';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';

export const listSessionsUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	input: TListSessionValidation;
}) => {
	const isAdmin = canManageProjects(ctx.userLevel, PROJECT_ADMIN_LEVELS);
	const { page, perPage, offset } = normalizePagination(ctx.input.page, ctx.input.perPage);

	// Non-admin hanya boleh melihat session miliknya sendiri.
	const testerUserId = isAdmin ? ctx.input.tester_user_id : ctx.userId;

	const filter = {
		idProject: ctx.input.id_project,
		testerUserId,
		status: ctx.input.status,
		result: ctx.input.result,
		dateFrom: ctx.input.date_from,
		dateTo: ctx.input.date_to
	};

	const [rows, total] = await Promise.all([
		queries.listSessions({ offset, perPage, filter }),
		queries.countSessions(filter)
	]);

	return {
		items: rows.map(domain.toSessionResponse),
		pagination: { page, perPage, total }
	};
};
