import {
	InvalidParameterException,
	NotAuthorizationException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';

/** Field sistem yang bisa dipetakan ke kolom spreadsheet (urutan = urutan kolom V4). */
export const TEMPLATE_FIELDS = [
	'group_no',
	'feature',
	'process_no',
	'test_type',
	'test_case_id',
	'test_variable',
	'scenario',
	'title',
	'pre_condition',
	'test_data',
	'test_steps',
	'expected_result',
	'status',
	'evidence',
	'remarks',
	'automation_tools',
	'test_date'
] as const;
export type TTemplateField = (typeof TEMPLATE_FIELDS)[number];

export const REQUIRED_MAPPING_FIELDS: readonly TTemplateField[] = ['test_case_id', 'title'];

export const TEMPLATE_ADMIN_LEVELS = ['SUPERADMIN', 'ADMIN'] as const;

export const canManageTemplates = (level: string | undefined): boolean =>
	!!level && (TEMPLATE_ADMIN_LEVELS as readonly string[]).includes(level.toUpperCase());

export const assertCanManageTemplates = (level: string | undefined): void => {
	if (!canManageTemplates(level))
		throw new NotAuthorizationException('Hanya ADMIN/SUPERADMIN yang dapat mengelola template test case.');
};

export const assertTemplateExists = (
	template: Entity.IQaTestCaseTemplate | null | undefined
): Entity.IQaTestCaseTemplate => {
	if (!template) throw new NotFoundException('Template test case tidak ditemukan.');
	return template;
};

/** Template default tidak boleh dinonaktifkan; pindahkan default ke template lain dulu. */
export const assertCanDeactivate = (template: Entity.IQaTestCaseTemplate): void => {
	if (template.is_default)
		throw new InvalidParameterException('Template default tidak bisa dinonaktifkan. Jadikan template lain default terlebih dahulu.');
};

export const assertCanSetDefault = (template: Entity.IQaTestCaseTemplate): void => {
	if (template.is_active === false)
		throw new InvalidParameterException('Template nonaktif tidak bisa dijadikan default.');
};

const parseJson = <T>(value: unknown, fallback: T): T => {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as T;
		} catch {
			return fallback;
		}
	}
	return value as T;
};

export const toTemplateResponse = (template: Entity.IQaTestCaseTemplate) => ({
	id_template: Number(template.id_template),
	version_label: template.version_label ?? '',
	name: template.name ?? '',
	spreadsheet_url: template.spreadsheet_url ?? '',
	gid: template.gid ?? null,
	column_mapping: parseJson<NonNullable<Entity.IQaTestCaseTemplate['column_mapping']>>(template.column_mapping, {}),
	export_anchors: parseJson<Record<string, unknown>>(template.export_anchors, {}),
	is_default: template.is_default === true,
	is_active: template.is_active !== false,
	created_by_user_id: template.created_by_user_id ? Number(template.created_by_user_id) : null,
	updated_by_user_id: template.updated_by_user_id ? Number(template.updated_by_user_id) : null,
	created_at: template.created_at ?? null,
	updated_at: template.updated_at ?? null
});
export type TTemplateResponse = ReturnType<typeof toTemplateResponse>;
