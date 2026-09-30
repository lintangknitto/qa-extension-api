import mysqlConnection from '@/libs/config/mysqlConnection';

export interface IUserFilter {
	search?: string;
	level?: string;
	isActive?: boolean;
}

const buildFilter = (filter: IUserFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.search) {
		clauses.push('(nama LIKE ? OR username LIKE ?)');
		const like = `%${filter.search}%`;
		params.push(like, like);
	}

	if (filter.level && filter.level !== 'all') {
		clauses.push('level = ?');
		params.push(filter.level.toUpperCase());
	}

	if (filter.isActive !== undefined) {
		clauses.push('(is_active = ? OR (is_active IS NULL AND aktif = ?))');
		const val = filter.isActive ? 1 : 0;
		params.push(val, val);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
};

export const findUserById = async (idUser: number): Promise<Entity.IUser | null> => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE id_user = ? LIMIT 1',
		[idUser]
	);
	return user ?? null;
};

export const findUserByUsername = async (username: string): Promise<Entity.IUser | null> => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE username = ? LIMIT 1',
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
	return mysqlConnection.raw<Entity.IUser[]>(
		`SELECT id_user, nama, username, level, is_active, aktif, created_at, updated_at FROM user ${where} ORDER BY id_user ASC LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countUsers = async (filter: IUserFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await mysqlConnection.raw<Array<{ total: number }>>(
		`SELECT COUNT(*) AS total FROM user ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const getUserAssignedProjectIds = async (idUser: number): Promise<number[]> => {
	try {
		const rows = await mysqlConnection.raw<Array<{ id_project: number }>>(
			'SELECT id_project FROM qa_user_project WHERE id_user = ?',
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
		const [tcRow] = await mysqlConnection.raw<Array<{ total: number }>>(
			'SELECT COUNT(*) AS total FROM qa_test_case WHERE created_by_user_id = ?',
			[idUser]
		);
		total += Number(tcRow?.total ?? 0);
	} catch {
		// Ignore if table not yet queried
	}

	try {
		const [sessRow] = await mysqlConnection.raw<Array<{ total: number }>>(
			'SELECT COUNT(*) AS total FROM qa_recording_session WHERE owner_user_id = ?',
			[idUser]
		);
		total += Number(sessRow?.total ?? 0);
	} catch {
		// Ignore
	}

	return total;
};
