import mysqlConnection from '@/libs/config/mysqlConnection';
import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';

export const getUserByUsername = async (username: string): Promise<Entity.IUser | null> => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE username = ? LIMIT 1',
		[username]
	);
	return user || null;
};

export const getUserByUsernameAndPassword = async (username: string, _password?: string): Promise<Entity.IUser | null> => {
	// Query user by username terlebih dahulu untuk verifikasi password modern / fallback
	const user = await getUserByUsername(username);
	return user;
};

export const getUserById = async (userId: number): Promise<Entity.IUser | null> => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE id_user = ? LIMIT 1',
		[userId]
	);
	return user || null;
};

export const updateUserPassword = async (userId: number, newHash: string): Promise<void> => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'UPDATE user SET password = ? WHERE id_user = ?',
		[newHash, userId]
	);
};
