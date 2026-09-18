import mysqlConnection from '@/libs/config/mysqlConnection';

export const getUserByUsernameAndPassword = async (username: string, password: string) => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE username = ? AND password = md5(?) LIMIT 1',
		[username, password]
	);
	return user || null;
};

export const getUserById = async (userId: number) => {
	const [user] = await mysqlConnection.raw<Entity.IUser[]>(
		'SELECT * FROM user WHERE id_user = ? LIMIT 1',
		[userId]
	);
	return user || null;
};
