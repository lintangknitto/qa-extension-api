import postgresConnection from '@/libs/config/postgresConnection';

export interface IUserFilter {
	search?: string;
	level?: string;
	isActive?: boolean;
}

const buildFilter = (filter: IUserFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.search) {
		clauses.push('(nama ILIKE ? OR username ILIKE ?)');
		const like = `%${filter.search}%`;
		params.push(like, like);
	}

	if (filter.level && filter.level !== 'all') {
		clauses.push('level = ?');
		params.push(filter.level.toUpperCase());
	}

	if (filter.isActive !== undefined) {
		clauses.push('is_active = ?');
		params.push(Boolean(filter.isActive));
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
};

export const findUserById = async (idUser: number): Promise<Entity.IUser | null> => {
	const [user] = await postgresConnection.raw<Entity.IUser[]>(
		'SELECT id_user, nama, username, password, level, is_active, created_at, updated_at FROM users WHERE id_user = ? LIMIT 1',
		[idUser]
	);
	return user ?? null;
};

export const findUserByUsername = async (username: string): Promise<Entity.IUser | null> => {
	const [user] = await postgresConnection.raw<Entity.IUser[]>(
		'SELECT id_user, nama, username, password, level, is_active, created_at, updated_at FROM users WHERE username = ? LIMIT 1',
		[username]
	);
	return user ?? null;
};

export const listUsers = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	level?: string;
	isActive?: boolean;
}): Promise<Entity.IUser[]> => {
	const { where, params } = buildFilter(options);
	return postgresConnection.raw<Entity.IUser[]>(
		`SELECT id_user, nama, username, level, is_active, created_at, updated_at FROM users ${where} ORDER BY id_user ASC LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countUsers = async (filter: IUserFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await postgresConnection.raw<Array<{ total: string | number }>>(
		`SELECT COUNT(*) AS total FROM users ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const getUserAssignedProjectIds = async (idUser: number): Promise<number[]> => {
	try {
		const rows = await postgresConnection.raw<Array<{ id_project: number | string }>>(
			'SELECT id_project FROM user_projects WHERE id_user = ?',
			[idUser]
		);
		return rows.map((r) => Number(r.id_project));
	} catch {
		return [];
	}
};

export const countUserAssociatedData = async (idUser: number): Promise<number> => {
	let total = 0;
	try {
		const [tcRow] = await postgresConnection.raw<Array<{ total: string | number }>>(
			'SELECT COUNT(*) AS total FROM test_cases WHERE created_by_user_id = ?',
			[idUser]
		);
		total += Number(tcRow?.total ?? 0);
	} catch {
		// Ignore if table not yet queried
	}

	try {
		const [sessRow] = await postgresConnection.raw<Array<{ total: string | number }>>(
			'SELECT COUNT(*) AS total FROM recording_sessions WHERE owner_user_id = ?',
			[idUser]
		);
		total += Number(sessRow?.total ?? 0);
	} catch {
		// Ignore
	}

	return total;
};
