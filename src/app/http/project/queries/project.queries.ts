import postgresConnection from '@/libs/config/postgresConnection';

export interface IProjectFilter {
	search?: string;
	idProgram?: number;
	isActive?: boolean;
	userId?: number;
	isGlobalAdmin?: boolean;
}

const buildFilter = (filter: IProjectFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.search) {
		clauses.push(`(
			p.name ILIKE ? OR p.code ILIKE ? OR prg.name ILIKE ? OR
			EXISTS (
				SELECT 1 FROM project_programs pp_s
				JOIN programs prg_s ON prg_s.id_program = pp_s.id_program
				WHERE pp_s.id_project = p.id_project AND (prg_s.name ILIKE ? OR prg_s.code ILIKE ?)
			)
		)`);
		const like = `%${filter.search}%`;
		params.push(like, like, like, like, like);
	}

	if (filter.idProgram !== undefined) {
		clauses.push(`(
			p.id_program = ? OR
			EXISTS (
				SELECT 1 FROM project_programs pp_f
				WHERE pp_f.id_project = p.id_project AND pp_f.id_program = ?
			)
		)`);
		params.push(filter.idProgram, filter.idProgram);
	}

	if (filter.isActive !== undefined) {
		clauses.push('p.is_active = ?');
		params.push(Boolean(filter.isActive));
	}

	if (!filter.isGlobalAdmin && filter.userId) {
		// Scoping: project yang di-assign ke user, atau semua project jika belum ada assignment terdaftar untuk user tersebut
		clauses.push('(p.id_project IN (SELECT id_project FROM user_projects WHERE id_user = ?) OR NOT EXISTS (SELECT 1 FROM user_projects WHERE id_user = ?))');
		params.push(filter.userId, filter.userId);
	}

	return {
		where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
};

const PROJECT_SELECT_FIELDS = `
	p.*,
	prg.name AS program_name,
	prg.code AS program_code,
	prg.base_url AS program_base_url,
	prg.repo_url AS program_repo_url,
	COALESCE(
		(
			SELECT json_agg(
				json_build_object(
					'id_program', prg_m.id_program,
					'name', prg_m.name,
					'code', prg_m.code,
					'type', prg_m.type,
					'grafana_dashboard_url', prg_m.grafana_dashboard_url,
					'base_url', prg_m.base_url,
					'repo_url', prg_m.repo_url
				) ORDER BY prg_m.name ASC
			)
			FROM project_programs pp_m
			JOIN programs prg_m ON prg_m.id_program = pp_m.id_program
			WHERE pp_m.id_project = p.id_project
		),
		'[]'::json
	) AS programs
`;

export const findProjectById = async (idProject: number): Promise<Entity.IQaProject | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaProject[]>(
		`SELECT ${PROJECT_SELECT_FIELDS}
		 FROM projects p
		 LEFT JOIN programs prg ON prg.id_program = p.id_program
		 WHERE p.id_project = ?
		 LIMIT 1`,
		[idProject]
	);
	return row ?? null;
};

export const findProjectByCode = async (code: string): Promise<Entity.IQaProject | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaProject[]>(
		`SELECT ${PROJECT_SELECT_FIELDS}
		 FROM projects p
		 LEFT JOIN programs prg ON prg.id_program = p.id_program
		 WHERE p.code = ?
		 LIMIT 1`,
		[code]
	);
	return row ?? null;
};

export const listProjects = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	idProgram?: number;
	isActive?: boolean;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<Entity.IQaProject[]> => {
	const { where, params } = buildFilter(options);
	return postgresConnection.raw<Entity.IQaProject[]>(
		`SELECT ${PROJECT_SELECT_FIELDS}
		 FROM projects p
		 LEFT JOIN programs prg ON prg.id_program = p.id_program
		 ${where}
		 ORDER BY p.created_at DESC, p.id_project DESC
		 LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countProjects = async (filter: IProjectFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await postgresConnection.raw<Array<{ total: string | number }>>(
		`SELECT COUNT(*) AS total
		 FROM projects p
		 LEFT JOIN programs prg ON prg.id_program = p.id_program
		 ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const listActiveProjects = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	idProgram?: number;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<Entity.IQaProject[]> => listProjects({ ...options, isActive: true });

export const countActiveProjects = async (options?: {
	search?: string;
	idProgram?: number;
	userId?: number;
	isGlobalAdmin?: boolean;
}): Promise<number> => countProjects({ ...options, isActive: true });

export const countProjectAssociatedData = async (idProject: number): Promise<number> => {
	const [tcRow] = await postgresConnection.raw<Array<{ total: string | number }>>(
		'SELECT COUNT(*) AS total FROM test_cases WHERE id_project = ?',
		[idProject]
	);
	const [sessRow] = await postgresConnection.raw<Array<{ total: string | number }>>(
		'SELECT COUNT(*) AS total FROM recording_sessions WHERE id_project = ?',
		[idProject]
	);
	return Number(tcRow?.total ?? 0) + Number(sessRow?.total ?? 0);
};
