import mysqlConnection from '@/libs/config/mysqlConnection';
import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';

export const insertUser = async (user: {
	nama: string;
	username: string;
	password: string;
	level: string;
	is_active?: number;
}): Promise<number> => {
	const isActive = user.is_active !== undefined ? user.is_active : 1;
	const result = await mysqlConnection.raw<MySqlResultSetHeader>(
		`INSERT INTO user (nama, username, password, level, is_active, aktif, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
		[user.nama, user.username, user.password, user.level, isActive, isActive]
	);
	return result.insertId;
};

export const updateUser = async (
	idUser: number,
	updates: {
		nama?: string;
		level?: string;
		is_active?: number;
	}
): Promise<void> => {
	const fields: string[] = ['updated_at = NOW()'];
	const params: unknown[] = [];

	if (updates.nama !== undefined) {
		fields.push('nama = ?');
		params.push(updates.nama);
	}
	if (updates.level !== undefined) {
		fields.push('level = ?');
		params.push(updates.level);
	}
	if (updates.is_active !== undefined) {
		fields.push('is_active = ?');
		params.push(updates.is_active);
		fields.push('aktif = ?');
		params.push(updates.is_active);
	}

	params.push(idUser);
	await mysqlConnection.raw<MySqlResultSetHeader>(
		`UPDATE user SET ${fields.join(', ')} WHERE id_user = ?`,
		params
	);
};

export const updateUserPassword = async (
	idUser: number,
	newHash: string
): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'UPDATE user SET password = ?, updated_at = NOW() WHERE id_user = ?',
		[newHash, idUser]
	);
};

export const setUserAssignedProjects = async (
	idUser: number,
	projectIds: number[],
	createdBy?: number
): Promise<void> => {
	// Hapus penugasan lama untuk user ini
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'DELETE FROM qa_user_project WHERE id_user = ?',
		[idUser]
	);

	// Insert penugasan baru jika ada
	if (projectIds && projectIds.length > 0) {
		const uniqueIds = Array.from(new Set(projectIds));
		for (const pid of uniqueIds) {
			await mysqlConnection.raw<MySqlResultSetHeader>(
				`INSERT INTO qa_user_project (id_user, id_project, created_at, created_by)
				 VALUES (?, ?, NOW(), ?)
				 ON DUPLICATE KEY UPDATE created_at = NOW()`,
				[idUser, pid, createdBy ?? null]
			);
		}
	}
};

export const deleteUser = async (idUser: number): Promise<void> => {
	// Bersihkan relasi project assignment
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'DELETE FROM qa_user_project WHERE id_user = ?',
		[idUser]
	);
	// Hapus user
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'DELETE FROM user WHERE id_user = ?',
		[idUser]
	);
};

export const softDeactivateUser = async (idUser: number): Promise<void> => {
	await updateUser(idUser, { is_active: 0 });
};
