import postgresConnection from '@/libs/config/postgresConnection';
import type { PoolClient } from 'pg';
import { PROJECT_METADATA_FIELDS, type TProjectMetadata } from '../domain/project.domain';

const syncProjectPrograms = async (
	client: PoolClient,
	idProject: number,
	programIds: number[]
): Promise<void> => {
	const uniqueIds = Array.from(new Set(programIds));
	if (uniqueIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
		throw new Error('Program ID harus berupa bilangan bulat positif.');
	}

	await client.query('DELETE FROM project_programs WHERE id_project = $1', [idProject]);
	for (const idProgram of uniqueIds) {
		await client.query(
			'INSERT INTO project_programs (id_project, id_program) VALUES ($1, $2)',
			[idProject, idProgram]
		);
	}
};

export const insertProject = async (fields: {
	name: string;
	code: string;
	idProgram?: number | null;
	programIds?: number[];
	description?: string | null;
	baseUrl?: string | null;
	repoUrl?: string | null;
	isActive: boolean;
	createdByUserId?: number | null;
	metadata?: TProjectMetadata;
}): Promise<number> => {
	const programIds = fields.programIds && fields.programIds.length > 0
		? fields.programIds
		: fields.idProgram
			? [fields.idProgram]
			: [];
	return postgresConnection.transaction(async (client) => {
		const { rows } = await client.query<{ id_project: number | string }>(
			`INSERT INTO projects (name, code, id_program, description, base_url, repo_url, is_active, created_by_user_id,
				${PROJECT_METADATA_FIELDS.join(', ')})
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${PROJECT_METADATA_FIELDS.map((_, i) => `$${i + 9}`).join(', ')})
			 RETURNING id_project`,
			[
				fields.name,
				fields.code,
				fields.idProgram ?? null,
				fields.description ?? null,
				fields.baseUrl ?? null,
				fields.repoUrl ?? null,
				Boolean(fields.isActive),
				fields.createdByUserId ?? null,
				...PROJECT_METADATA_FIELDS.map((field) => fields.metadata?.[field] ?? null)
			]
		);
		const idProject = Number(rows[0]?.id_project);
		if (!Number.isSafeInteger(idProject) || idProject < 1) throw new Error('Gagal membuat project.');
		if (programIds.length > 0) await syncProjectPrograms(client, idProject, programIds);
		return idProject;
	});
};

export const updateProject = async (
	idProject: number,
	fields: {
		name?: string;
		code?: string;
		idProgram?: number | null;
		programIds?: number[];
		description?: string | null;
		baseUrl?: string | null;
		repoUrl?: string | null;
		isActive?: boolean;
		metadata?: TProjectMetadata;
	}
): Promise<void> => {
	const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
	const params: unknown[] = [];

	if (fields.name !== undefined) {
		params.push(fields.name);
		assignments.push(`name = $${params.length}`);
	}
	if (fields.code !== undefined) {
		params.push(fields.code);
		assignments.push(`code = $${params.length}`);
	}
	if (fields.idProgram !== undefined) {
		params.push(fields.idProgram);
		assignments.push(`id_program = $${params.length}`);
	}
	if (fields.description !== undefined) {
		params.push(fields.description);
		assignments.push(`description = $${params.length}`);
	}
	if (fields.baseUrl !== undefined) {
		params.push(fields.baseUrl);
		assignments.push(`base_url = $${params.length}`);
	}
	if (fields.repoUrl !== undefined) {
		params.push(fields.repoUrl);
		assignments.push(`repo_url = $${params.length}`);
	}
	if (fields.isActive !== undefined) {
		params.push(Boolean(fields.isActive));
		assignments.push(`is_active = $${params.length}`);
	}
	for (const field of PROJECT_METADATA_FIELDS) {
		const value = fields.metadata?.[field];
		if (value === undefined) continue;
		params.push(value);
		assignments.push(`${field} = $${params.length}`);
	}

	params.push(idProject);
	const programIds = fields.programIds !== undefined
		? fields.programIds
		: fields.idProgram !== undefined
			? fields.idProgram ? [fields.idProgram] : []
			: undefined;

	await postgresConnection.transaction(async (client) => {
		await client.query(
			`UPDATE projects SET ${assignments.join(', ')} WHERE id_project = $${params.length}`,
			params
		);
		if (programIds !== undefined) await syncProjectPrograms(client, idProject, programIds);
	});
};

export const setProjectActive = async (idProject: number, isActive: boolean): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE projects SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id_project = $2',
		[Boolean(isActive), idProject]
	);
};

export const deleteProjectPermanently = async (idProject: number): Promise<void> => {
	await postgresConnection.raw(
		'DELETE FROM projects WHERE id_project = $1',
		[idProject]
	);
};
