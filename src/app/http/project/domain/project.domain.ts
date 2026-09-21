import {
	InvalidParameterException,
	NotFoundException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	canManageProjects as canManageProjectsShared,
	assertCanManageProjects as assertCanManageProjectsShared
} from '@/libs/helpers/access';

export const PROJECT_CODE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PROJECT_CODE_MAX_LENGTH = 60;

/**
 * Mengubah nama project menjadi kode yang stabil dan aman dipakai di URL/object key.
 */
export const slugifyProjectCode = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, PROJECT_CODE_MAX_LENGTH);

export const canManageProjects = canManageProjectsShared;

export const assertCanManageProjects = assertCanManageProjectsShared;

export const assertValidProjectCode = (code: string): void => {
	if (!PROJECT_CODE_REGEX.test(code))
		throw new InvalidParameterException(
			'Kode project tidak valid. Gunakan huruf kecil, angka, dan tanda hubung.'
		);
};

/**
 * Menentukan kode final project: pakai `code` bila diberikan, jika tidak turunkan dari `name`.
 */
export const resolveProjectCode = (name: string, code?: string | null): string => {
	const resolved = slugifyProjectCode(code && code.trim() ? code : name);
	assertValidProjectCode(resolved);
	return resolved;
};

export const assertProjectExists = (project: Entity.IQaProject | null): Entity.IQaProject => {
	if (!project) throw new NotFoundException('Project tidak ditemukan.');
	return project;
};

export { normalizePagination } from '@/libs/helpers/pagination';

export const toProjectResponse = (project: Entity.IQaProject) => ({
	id_project: project.id_project ?? null,
	name: project.name ?? null,
	code: project.code ?? null,
	description: project.description ?? null,
	base_url: project.base_url ?? null,
	is_active: project.is_active === 1,
	created_at: project.created_at ?? null,
	updated_at: project.updated_at ?? null
});
