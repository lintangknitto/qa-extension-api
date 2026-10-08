import postgresConnection from '@/libs/config/postgresConnection';

export const findTemplates = async (includeInactive: boolean): Promise<Entity.IQaTestCaseTemplate[]> =>
	postgresConnection.raw<Entity.IQaTestCaseTemplate[]>(
		`SELECT * FROM test_case_templates
		 ${includeInactive ? '' : 'WHERE is_active = TRUE'}
		 ORDER BY is_default DESC, id_template DESC`
	);

export const findTemplateById = async (idTemplate: number): Promise<Entity.IQaTestCaseTemplate | null> => {
	const rows = await postgresConnection.raw<Entity.IQaTestCaseTemplate[]>(
		'SELECT * FROM test_case_templates WHERE id_template = ? LIMIT 1',
		[idTemplate]
	);
	return rows[0] ?? null;
};

export const findDefaultTemplate = async (): Promise<Entity.IQaTestCaseTemplate | null> => {
	const rows = await postgresConnection.raw<Entity.IQaTestCaseTemplate[]>(
		'SELECT * FROM test_case_templates WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
	);
	return rows[0] ?? null;
};

export const findTemplateByVersion = async (versionLabel: string): Promise<Entity.IQaTestCaseTemplate | null> => {
	const rows = await postgresConnection.raw<Entity.IQaTestCaseTemplate[]>(
		'SELECT * FROM test_case_templates WHERE LOWER(version_label) = LOWER(?) LIMIT 1',
		[versionLabel]
	);
	return rows[0] ?? null;
};
