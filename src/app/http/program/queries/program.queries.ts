import postgresConnection from '@/libs/config/postgresConnection';

export interface IProgramFilter {
	search?: string;
	isActive?: boolean;
}

const buildFilter = (filter: IProgramFilter): { where: string; params: unknown[] } => {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (filter.search) {
		clauses.push('(name ILIKE ? OR code ILIKE ?)');
		const like = `%${filter.search}%`;
		params.push(like, like);
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

export const findProgramById = async (idProgram: number): Promise<Entity.IQaProgram | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaProgram[]>(
		'SELECT * FROM programs WHERE id_program = ? LIMIT 1',
		[idProgram]
	);
	return row ?? null;
};

export const findProgramByCode = async (code: string): Promise<Entity.IQaProgram | null> => {
	const [row] = await postgresConnection.raw<Entity.IQaProgram[]>(
		'SELECT * FROM programs WHERE code = ? LIMIT 1',
		[code]
	);
	return row ?? null;
};

export const listPrograms = async (options: {
	offset: number;
	perPage: number;
	search?: string;
	isActive?: boolean;
}): Promise<Array<Entity.IQaProgram & { project_count?: number }>> => {
	const { where, params } = buildFilter(options);
	return postgresConnection.raw<Array<Entity.IQaProgram & { project_count?: number }>>(
		`SELECT prg.*,
		        (
		            SELECT COUNT(DISTINCT proj_id)::int FROM (
		                SELECT p.id_project AS proj_id FROM projects p WHERE p.id_program = prg.id_program
		                UNION
		                SELECT pp.id_project AS proj_id FROM project_programs pp WHERE pp.id_program = prg.id_program
		            ) all_projs
		        ) AS project_count
		 FROM programs prg
		 ${where}
		 ORDER BY prg.created_at DESC, prg.id_program DESC
		 LIMIT ${options.perPage} OFFSET ${options.offset}`,
		params
	);
};

export const countPrograms = async (filter: IProgramFilter): Promise<number> => {
	const { where, params } = buildFilter(filter);
	const [row] = await postgresConnection.raw<Array<{ total: string | number }>>(
		`SELECT COUNT(*) AS total FROM programs ${where}`,
		params
	);
	return Number(row?.total ?? 0);
};

export const listActivePrograms = async (options: {
	offset: number;
	perPage: number;
	search?: string;
}): Promise<Entity.IQaProgram[]> => listPrograms({ ...options, isActive: true });

export const countActivePrograms = async (options?: {
	search?: string;
}): Promise<number> => countPrograms({ ...options, isActive: true });

export const countProgramAssociatedProjects = async (idProgram: number): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ total: string | number }>>(
		`SELECT COUNT(DISTINCT project_id) AS total
		 FROM (
			SELECT id_project AS project_id FROM projects WHERE id_program = ?
			UNION
			SELECT id_project AS project_id FROM project_programs WHERE id_program = ?
		 ) associated_projects`,
		[idProgram, idProgram]
	);
	return Number(row?.total ?? 0);
};

/** Program aktif milik project (kolom `projects.id_program` maupun relasi `project_programs`). */
export const listProgramsForProject = async (idProject: number): Promise<Entity.IQaProgram[]> =>
	postgresConnection.raw<Entity.IQaProgram[]>(
		`SELECT DISTINCT prg.*
		 FROM programs prg
		 WHERE prg.is_active = TRUE
		   AND (
			prg.id_program IN (SELECT id_program FROM projects WHERE id_project = ? AND id_program IS NOT NULL)
			OR prg.id_program IN (SELECT id_program FROM project_programs WHERE id_project = ?)
		   )
		 ORDER BY prg.id_program ASC`,
		[idProject, idProject]
	);
