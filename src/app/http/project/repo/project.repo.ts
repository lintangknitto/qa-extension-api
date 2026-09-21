import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';
import mysqlConnection from '@/libs/config/mysqlConnection';

export const insertProject = async (fields: {
	name: string;
	code: string;
	description?: string | null;
	baseUrl?: string | null;
	isActive: boolean;
	createdByUserId?: number | null;
}): Promise<number> => {
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO qa_project (name, code, description, base_url, is_active, created_by_user_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[
			fields.name,
			fields.code,
			fields.description ?? null,
			fields.baseUrl ?? null,
			fields.isActive ? 1 : 0,
			fields.createdByUserId ?? null
		]
	);
	return Number(result.insertId);
};

export const updateProject = async (
	idProject: number,
	fields: {
		name?: string;
		code?: string;
		description?: string | null;
		baseUrl?: string | null;
		isActive?: boolean;
	}
): Promise<void> => {
	const assignments: string[] = [];
	const params: unknown[] = [];

	if (fields.name !== undefined) {
		assignments.push('name = ?');
		params.push(fields.name);
	}
	if (fields.code !== undefined) {
		assignments.push('code = ?');
		params.push(fields.code);
	}
	if (fields.description !== undefined) {
		assignments.push('description = ?');
		params.push(fields.description);
	}
	if (fields.baseUrl !== undefined) {
		assignments.push('base_url = ?');
		params.push(fields.baseUrl);
	}
	if (fields.isActive !== undefined) {
		assignments.push('is_active = ?');
		params.push(fields.isActive ? 1 : 0);
	}

	if (assignments.length === 0) return;

	params.push(idProject);
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE qa_project SET ${assignments.join(', ')} WHERE id_project = ?`,
		params
	);
};

export const setProjectActive = async (idProject: number, isActive: boolean): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'UPDATE qa_project SET is_active = ? WHERE id_project = ?',
		[isActive ? 1 : 0, idProject]
	);
};
