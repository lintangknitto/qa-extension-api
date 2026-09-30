import mysqlConnection from '@/libs/config/mysqlConnection';

export interface IProjectFilter {
	search?: string;
	isActive?: boolean;
	userId?: number;
	isGlobalAdmin?: boolean;
}

const buildFilter = (filter: IProjectFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.search) {
		clauses.push('(name LIKE ? OR code LIKE ?)');
		const like = `%${filter.search}%`;
		params.push(like, like);
	}

	if (filter.isActive !== undefined) {
		clauses.push('is_active = ?');
		params.push(filter.isActive ? 1 : 0);
	}

	if (!filter.isGlobalAdmin && filter.userId) {
		// Scoping: project yang di-assign ke user, atau semua project jika belum ada assignment terdaftar untuk user tersebut
		clauses.push('(id_project IN (SELECT id_project FROM qa_user_project WHERE id_user = ?) OR NOT EXISTS (SELECT 1 FROM qa_user_project WHERE id_user = ?))');
		params.push(filter.userId, filter.userId);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
};

export const findProjectById = async (idProject: number): Promise<Entity.IQaProject | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaProject[]>(
		'SELECT * FROM qa_project WHERE id_project = ? LIMIT 1',
		[idProject]
	);
	return row ?? null;
};

export const findProjectByCode = async (code: string): Promise<Entity.IQaProject | null> => {
	const [row] = await mysqlConnection.raw<Entity.IQaProject[]>(
		'SELECT * FROM qa_project WHERE code = ? LIMIT 1',
		[code]
	);
	return row ?? null;
};

export const listProjects = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	isActive?: boolean;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<Entity.IQaProject[]> => {
	const { where, params } = buildFilter(options);
	return mysqlConnection.raw<Entity.IQaProject[]>(
		`SELECT * FROM qa_project ${where} ORDER BY created_at DESC, id_project DESC LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countProjects = async (filter: IProjectFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await mysqlConnection.raw<Array<{ total: number }>>(
		`SELECT COUNT(*) AS total FROM qa_project ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const listActiveProjects = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<Entity.IQaProject[]> => listProjects({ ...options, isActive: true });

export const countActiveProjects = async (options?: {
	search?: string;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<number> => countProjects({ ...options, isActive: true });

export const countProjectAssociatedData = async (idProject: number): Promise<number> => {
	const [tcRow] = await mysqlConnection.raw<Array<{ total: number }>>(
		'SELECT COUNT(*) AS total FROM qa_test_case WHERE id_project = ?',
		[idProject]
	);
	const [sessRow] = await mysqlConnection.raw<Array<{ total: number }>>(
		'SELECT COUNT(*) AS total FROM qa_recording_session WHERE id_project = ?',
		[idProject]
	);
	return Number(tcRow?.total ?? 0) + Number(sessRow?.total ?? 0);
};
