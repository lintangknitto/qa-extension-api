import { NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

/**
 * Aturan akses bersama untuk fitur recording (project & session).
 * Dipakai lintas modul supaya definisi QA/admin hanya ada di satu tempat.
 */
export const canManageProjects = (level: string | undefined, adminLevels: readonly string[]): boolean =>
	!!level && adminLevels.some((adminLevel) => adminLevel.toUpperCase() === level.toUpperCase());

export const assertCanManageProjects = (level: string | undefined, adminLevels: readonly string[]): void => {
	if (!canManageProjects(level, adminLevels))
		throw new NotAuthorizationException('Hanya QA/admin yang dapat mengelola master project.');
};
