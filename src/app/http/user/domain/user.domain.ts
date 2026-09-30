import {
	InvalidParameterException,
	NotFoundException,
	NotAuthorizationException
} from '@knittotextile/knitto-core-backend/dist/CoreException';

export const VALID_LEVELS = [
	'SUPERADMIN',
	'ADMIN',
	'QA',
	'IMPLEMENTOR',
	'VIEWER'
] as const;

export const normalizeUserLevel = (level?: string): string => {
	const upper = String(level ?? '').trim().toUpperCase();
	if (VALID_LEVELS.includes(upper as any)) return upper;
	return 'QA';
};

export function assertUserExists(
	user: Entity.IUser | null
): asserts user is Entity.IUser {
	if (!user) {
		throw new NotFoundException('User tidak ditemukan.');
	}
}

export const assertUniqueUsername = (
	existingUser: Entity.IUser | null,
	currentUserId?: number
): void => {
	if (existingUser && existingUser.id_user !== currentUserId) {
		throw new InvalidParameterException('Username sudah digunakan oleh akun lain.');
	}
};

/**
 * Validasi hak akses actor terhadap target user:
 * - SUPERADMIN dapat mengelola semua level user.
 * - ADMIN hanya dapat mengelola level non-SUPERADMIN (ADMIN, QA, IMPLEMENTOR, VIEWER) dan tidak boleh mengubah user SUPERADMIN menjadi non-SUPERADMIN atau sebaliknya.
 * - Non-admin tidak boleh mengelola user sama sekali.
 */
export const assertCanManageTargetUser = (
	actorLevel: string | undefined,
	targetUserLevel: string | undefined,
	newRequestedLevel?: string
): void => {
	const actor = String(actorLevel ?? '').toUpperCase();
	const target = String(targetUserLevel ?? '').toUpperCase();
	const requested = newRequestedLevel ? String(newRequestedLevel).toUpperCase() : undefined;

	if (actor !== 'SUPERADMIN' && actor !== 'ADMIN') {
		throw new NotAuthorizationException('Hanya Administrator yang memiliki akses manajemen pengguna.');
	}

	if (actor === 'ADMIN') {
		if (target === 'SUPERADMIN') {
			throw new NotAuthorizationException('Admin tidak diizinkan mengelola akun Superadmin.');
		}
		if (requested === 'SUPERADMIN') {
			throw new NotAuthorizationException('Admin tidak diizinkan memberikan level Superadmin ke pengguna.');
		}
	}
};

export const toUserListItemResponse = (user: Entity.IUser) => {
	const isActive = user.is_active !== undefined ? Number(user.is_active) : (user.aktif !== undefined ? Number(user.aktif) : 1);
	return {
		id_user: user.id_user,
		nama: user.nama ?? '',
		username: user.username ?? '',
		level: user.level ?? 'QA',
		is_active: isActive === 1,
		created_at: user.created_at ?? null,
		updated_at: user.updated_at ?? null
	};
};

export const toUserDetailResponse = (
	user: Entity.IUser,
	assignedProjectIds: number[] = []
) => {
	return {
		...toUserListItemResponse(user),
		assigned_project_ids: assignedProjectIds
	};
};
