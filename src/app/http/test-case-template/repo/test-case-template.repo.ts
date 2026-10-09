import postgresConnection from '@/libs/config/postgresConnection';
import type { TCreateTemplateValidation, TUpdateTemplateValidation } from '../test-case-template.request';

export const insertTemplate = async (data: TCreateTemplateValidation, userId?: number): Promise<number> =>
	postgresConnection.transaction(async (client) => {
		// Default dipindah dalam satu transaksi supaya unique index "satu default" tidak bentrok.
		if (data.is_default) await client.query('UPDATE test_case_templates SET is_default = FALSE WHERE is_default');
		const { rows } = await client.query<{ id_template: number | string }>(
			`INSERT INTO test_case_templates (
				version_label, name, spreadsheet_url, gid, column_mapping, export_anchors,
				is_default, is_active, created_by_user_id, updated_by_user_id
			) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, TRUE, $8, $8)
			RETURNING id_template`,
			[
				data.version_label,
				data.name,
				data.spreadsheet_url,
				data.gid || null,
				JSON.stringify(data.column_mapping),
				JSON.stringify(data.export_anchors ?? {}),
				data.is_default === true,
				userId ?? null
			]
		);
		return Number(rows[0]?.id_template);
	});

export const updateTemplate = async (
	idTemplate: number,
	data: TUpdateTemplateValidation,
	userId?: number
): Promise<void> => {
	const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
	const params: unknown[] = [];
	const set = (column: string, value: unknown, cast = '') => {
		params.push(value);
		assignments.push(`${column} = $${params.length}${cast}`);
	};

	if (data.version_label !== undefined) set('version_label', data.version_label);
	if (data.name !== undefined) set('name', data.name);
	if (data.spreadsheet_url !== undefined) set('spreadsheet_url', data.spreadsheet_url);
	if (data.gid !== undefined) set('gid', data.gid || null);
	if (data.column_mapping !== undefined) set('column_mapping', JSON.stringify(data.column_mapping), '::jsonb');
	if (data.export_anchors !== undefined) set('export_anchors', JSON.stringify(data.export_anchors), '::jsonb');
	if (data.is_active !== undefined) set('is_active', data.is_active);
	set('updated_by_user_id', userId ?? null);

	params.push(idTemplate);
	await postgresConnection.raw(
		`UPDATE test_case_templates SET ${assignments.join(', ')} WHERE id_template = $${params.length}`,
		params
	);
};

export const setDefaultTemplate = async (idTemplate: number, userId?: number): Promise<void> => {
	await postgresConnection.transaction(async (client) => {
		await client.query('UPDATE test_case_templates SET is_default = FALSE WHERE is_default AND id_template <> $1', [idTemplate]);
		await client.query(
			`UPDATE test_case_templates
			 SET is_default = TRUE, updated_by_user_id = $2, updated_at = CURRENT_TIMESTAMP
			 WHERE id_template = $1`,
			[idTemplate, userId ?? null]
		);
	});
};
