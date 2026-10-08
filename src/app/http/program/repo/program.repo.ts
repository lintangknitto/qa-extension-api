import postgresConnection from '@/libs/config/postgresConnection';

export const insertProgram = async (fields: {
	name: string;
	code: string;
	type?: string;
	grafanaDashboardUrl?: string | null;
	description?: string | null;
	baseUrl?: string | null;
	repoUrl?: string | null;
	isActive: boolean;
	createdByUserId?: number | null;
}): Promise<number> => {
	const [row] = await postgresConnection.raw<Array<{ id_program: number | string }>>(
		`INSERT INTO programs (name, code, type, grafana_dashboard_url, description, base_url, repo_url, is_active, created_by_user_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 RETURNING id_program`,
		[
			fields.name,
			fields.code,
			fields.type || 'FRONTEND',
			fields.grafanaDashboardUrl ?? null,
			fields.description ?? null,
			fields.baseUrl ?? null,
			fields.repoUrl ?? null,
			Boolean(fields.isActive),
			fields.createdByUserId ?? null
		]
	);
	return Number(row?.id_program);
};

export const updateProgram = async (
	idProgram: number,
	fields: {
		name?: string;
		code?: string;
		type?: string;
		grafanaDashboardUrl?: string | null;
		description?: string | null;
		baseUrl?: string | null;
		repoUrl?: string | null;
		isActive?: boolean;
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
	if (fields.type !== undefined) {
		params.push(fields.type);
		assignments.push(`type = $${params.length}`);
	}
	if (fields.grafanaDashboardUrl !== undefined) {
		params.push(fields.grafanaDashboardUrl);
		assignments.push(`grafana_dashboard_url = $${params.length}`);
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

	params.push(idProgram);
	await postgresConnection.raw(
		`UPDATE programs SET ${assignments.join(', ')} WHERE id_program = $${params.length}`,
		params
	);
};

export const setProgramActive = async (idProgram: number, isActive: boolean): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE programs SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id_program = $2',
		[Boolean(isActive), idProgram]
	);
};

export const deleteProgramPermanently = async (idProgram: number): Promise<void> => {
	await postgresConnection.raw(
		'DELETE FROM programs WHERE id_program = $1',
		[idProgram]
	);
};
