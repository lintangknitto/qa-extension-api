import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
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

/**
 * Memeriksa apakah user memiliki wewenang untuk mengelola project spesifik:
 * - SUPERADMIN dan ADMIN dapat mengelola semua project secara global.
 * - QA Tester dapat mengelola jika merupakan pembuat/creator project tersebut.
 */
export const canManageSpecificProject = (
	userLevel: string | undefined,
	userId: number | undefined,
	project: Entity.IQaProject
): boolean => {
	if (!userLevel) return false;
	const norm = userLevel.toUpperCase();
	if (['SUPERADMIN', 'ADMIN'].includes(norm)) return true;
	if (norm === 'QA') {
		if (project.created_by_user_id === undefined || project.created_by_user_id === null) {
			return true;
		}
		if (typeof userId === 'number' && Number(project.created_by_user_id) === Number(userId)) {
			return true;
		}
		return false;
	}
	return false;
};

export const assertCanManageSpecificProject = (
	userLevel: string | undefined,
	userId: number | undefined,
	project: Entity.IQaProject
): void => {
	if (!canManageSpecificProject(userLevel, userId, project)) {
		throw new NotAuthorizationException('Anda tidak memiliki wewenang untuk mengelola project ini.');
	}
};

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

type TProjectProgram = NonNullable<Entity.IQaProject['programs']>[number];

const toProgramSummary = (program: TProjectProgram) => ({
	id_program: Number(program.id_program),
	name: program.name,
	code: program.code,
	type: (program as any).type ?? null,
	base_url: program.base_url ?? null,
	repo_url: program.repo_url ?? null
});

/** Primary program fields: explicit columns first, otherwise the first linked program. */
const toPrimaryProgram = (project: Entity.IQaProject, programs: TProjectProgram[], programIds: number[]) => ({
	id_program: project.id_program ? Number(project.id_program) : (programIds[0] ?? null),
	program_name: project.program_name ?? programs[0]?.name ?? null,
	program_code: project.program_code ?? programs[0]?.code ?? null
});

export const toProjectResponse = (project: Entity.IQaProject) => {
	const programs = project.programs ?? [];
	const programIds = project.program_ids?.map(Number) ?? programs.map((program) => Number(program.id_program));

	return {
		id_project: project.id_project ? Number(project.id_project) : null,
		...toPrimaryProgram(project, programs, programIds),
		program_ids: programIds,
		programs: programs.map(toProgramSummary),
		name: project.name ?? null,
		code: project.code ?? null,
		description: project.description ?? null,
		base_url: project.base_url ?? null,
		repo_url: project.repo_url ?? null,
		is_active: project.is_active === 1 || project.is_active === true,
		created_by_user_id: project.created_by_user_id ? Number(project.created_by_user_id) : null,
		created_at: project.created_at ?? null,
		updated_at: project.updated_at ?? null
	};
};
