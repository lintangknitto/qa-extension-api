import * as queries from '../queries/user.queries';
import * as domain from '../domain/user.domain';
import { TListUserValidation } from '../user.request';

export const listUsersUseCase = async (query: TListUserValidation) => {
	const page = Math.max(0, Number(query.page ?? 0));
	const perPage = Math.min(100, Math.max(1, Number(query.perPage ?? 20)));
	const offset = page * perPage;

	let isActiveFilter: boolean | undefined;
	if (query.is_active === 'true') isActiveFilter = true;
	if (query.is_active === 'false') isActiveFilter = false;

	const filter = {
		search: query.search?.trim(),
		level: query.level,
		isActive: isActiveFilter
	};

	const [rows, total] = await Promise.all([
		queries.listUsers({
			offset,
			perPage,
			...filter
		}),
		queries.countUsers(filter)
	]);

	const list = rows.map((user) => domain.toUserListItemResponse(user));

	return {
		list,
		total,
		page,
		perPage,
		totalPages: Math.ceil(total / perPage)
	};
};
