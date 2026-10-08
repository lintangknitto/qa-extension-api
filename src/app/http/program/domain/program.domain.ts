import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	canManageProjects as canManageProjectsShared,
	assertCanManageProjects as assertCanManageProjectsShared
} from '@/libs/helpers/access';

export const PROGRAM_CODE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PROGRAM_CODE_MAX_LENGTH = 60;

/**
 * Mengubah nama program menjadi kode yang stabil dan aman dipakai di URL/identifier.
 */
export const slugifyProgramCode = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, PROGRAM_CODE_MAX_LENGTH);

export const canManagePrograms = canManageProjectsShared;
export const assertCanManagePrograms = assertCanManageProjectsShared;

/**
 * Memeriksa apakah user memiliki wewenang untuk mengelola program spesifik:
 * - SUPERADMIN dan ADMIN dapat mengelola semua program secara global.
 * - QA Tester dapat mengelola jika merupakan pembuat/creator program tersebut.
 */
export const canManageSpecificProgram = (
	userLevel: string | undefined,
	userId: number | undefined,
	program: Entity.IQaProgram
): boolean => {
	if (!userLevel) return false;
	const norm = userLevel.toUpperCase();
	if (['SUPERADMIN', 'ADMIN'].includes(norm)) return true;
	if (
		norm === 'QA' &&
		typeof userId === 'number' &&
		program.created_by_user_id !== undefined &&
		program.created_by_user_id !== null &&
		Number(program.created_by_user_id) === Number(userId)
	) {
		return true;
	}
	return false;
};

export const assertCanManageSpecificProgram = (
	userLevel: string | undefined,
	userId: number | undefined,
	program: Entity.IQaProgram
): void => {
	if (!canManageSpecificProgram(userLevel, userId, program)) {
		throw new NotAuthorizationException('Anda tidak memiliki wewenang untuk mengelola program ini.');
	}
};

export const assertValidProgramCode = (code: string): void => {
	if (!PROGRAM_CODE_REGEX.test(code)) {
		throw new InvalidParameterException(
			'Kode program tidak valid. Gunakan huruf kecil, angka, dan tanda hubung.'
		);
	}
};

/**
 * Menentukan kode final program: pakai `code` bila diberikan, jika tidak turunkan dari `name`.
 */
export const resolveProgramCode = (name: string, code?: string | null): string => {
	const resolved = slugifyProgramCode(code && code.trim() ? code : name);
	assertValidProgramCode(resolved);
	return resolved;
};

export const normalizeProgramType = (type?: string | null): 'FRONTEND' | 'SERVICE' => {
	if (!type) return 'FRONTEND';
	const upper = type.trim().toUpperCase();
	if (upper === 'SERVICE' || upper === 'BACKEND' || upper === 'API') return 'SERVICE';
	return 'FRONTEND';
};

export const assertProgramExists = (program: Entity.IQaProgram | null): Entity.IQaProgram => {
	if (!program) throw new NotFoundException('Program tidak ditemukan.');
	return program;
};

export { normalizePagination } from '@/libs/helpers/pagination';

export const toProgramResponse = (program: Entity.IQaProgram & { project_count?: number }) => ({
	id_program: program.id_program ?? null,
	name: program.name ?? null,
	code: program.code ?? null,
	type: normalizeProgramType(program.type),
	grafana_dashboard_url: program.grafana_dashboard_url ?? null,
	description: program.description ?? null,
	base_url: program.base_url ?? null,
	repo_url: program.repo_url ?? null,
	project_count: program.project_count !== undefined ? Number(program.project_count) : undefined,
	is_active: program.is_active === 1 || program.is_active === true,
	created_by_user_id: program.created_by_user_id ? Number(program.created_by_user_id) : null,
	created_at: program.created_at ?? null,
	updated_at: program.updated_at ?? null
});
