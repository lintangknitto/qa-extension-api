import postgresConnection from '@/libs/config/postgresConnection';

export const insertUser = async (user: {
	nama: string;
	username: string;
	password: string;
	level: string;
	is_active?: boolean | number;
}): Promise<number> => {
	const isActive = user.is_active !== undefined ? Boolean(user.is_active) : true;
	const [row] = await postgresConnection.raw<Array<{ id_user: number | string }>>(
		`INSERT INTO users (nama, username, password, level, is_active, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 RETURNING id_user`,
		[user.nama, user.username, user.password, user.level, isActive]
	);
	return Number(row?.id_user);
};

export const updateUser = async (
	idUser: number,
	updates: {
		nama?: string;
		level?: string;
		is_active?: boolean | number;
	}
): Promise<void> => {
	const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
	const params: unknown[] = [];

	if (updates.nama !== undefined) {
		params.push(updates.nama);
		fields.push(`nama = $${params.length}`);
	}
	if (updates.level !== undefined) {
		params.push(updates.level);
		fields.push(`level = $${params.length}`);
	}
	if (updates.is_active !== undefined) {
		params.push(Boolean(updates.is_active));
		fields.push(`is_active = $${params.length}`);
	}

	params.push(idUser);
	await postgresConnection.raw(
		`UPDATE users SET ${fields.join(', ')} WHERE id_user = $${params.length}`,
		params
	);
};

export const updateUserPassword = async (
	idUser: number,
	newHash: string
): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id_user = $2',
		[newHash, idUser]
	);
};

export const setUserAssignedProjects = async (
	idUser: number,
	projectIds: number[],
	_actorUserId?: number
): Promise<void> => {
	// Hapus penugasan lama untuk user ini
	await postgresConnection.raw(
		'DELETE FROM user_projects WHERE id_user = $1',
		[idUser]
	);

	// Insert penugasan baru jika ada
	if (projectIds && projectIds.length > 0) {
		const uniqueIds = Array.from(new Set(projectIds));
		for (const pid of uniqueIds) {
			await postgresConnection.raw(
				`INSERT INTO user_projects (id_user, id_project, created_at)
				 VALUES ($1, $2, CURRENT_TIMESTAMP)
				 ON CONFLICT (id_user, id_project) DO NOTHING`,
				[idUser, pid]
			);
		}
	}
};

export const deleteUser = async (idUser: number): Promise<void> => {
	// Foreign key cascade will handle user_projects, but explicit delete is safe
	await postgresConnection.raw(
		'DELETE FROM user_projects WHERE id_user = $1',
		[idUser]
	);
	await postgresConnection.raw(
		'DELETE FROM users WHERE id_user = $1',
		[idUser]
	);
};

export const softDeactivateUser = async (idUser: number): Promise<void> => {
	await updateUser(idUser, { is_active: false });
};
