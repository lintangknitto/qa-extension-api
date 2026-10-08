import postgresConnection from '@/libs/config/postgresConnection';

export const getUserByUsername = async (username: string): Promise<Entity.IUser | null> => {
	const [user] = await postgresConnection.raw<Entity.IUser[]>(
		'SELECT * FROM users WHERE username = $1 LIMIT 1',
		[username]
	);
	return user || null;
};

export const getUserByUsernameAndPassword = async (username: string, _password?: string): Promise<Entity.IUser | null> => {
	const user = await getUserByUsername(username);
	return user;
};

export const getUserById = async (userId: number): Promise<Entity.IUser | null> => {
	const [user] = await postgresConnection.raw<Entity.IUser[]>(
		'SELECT * FROM users WHERE id_user = $1 LIMIT 1',
		[userId]
	);
	return user || null;
};

export const updateUserPassword = async (userId: number, newHash: string): Promise<void> => {
	await postgresConnection.raw(
		'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id_user = $2',
		[newHash, userId]
	);
};
