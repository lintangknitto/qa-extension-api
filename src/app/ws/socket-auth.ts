import jwt from 'jsonwebtoken';
import { APP_SECRET_KEY } from '@/libs/config';
import postgresConnection from '@/libs/config/postgresConnection';

export interface ISocketUser {
	id_user: number;
	username: string;
	nama: string;
	level: string;
}

export const extractSocketToken = (handshake: {
	auth?: Record<string, unknown>;
	headers?: Record<string, unknown>;
}): string | null => {
	const authToken = handshake.auth?.token;
	if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

	const header = handshake.headers?.authorization;
	if (typeof header === 'string') {
		const [scheme, value] = header.split(' ');
		if (scheme === 'Bearer' && value && value.trim()) return value.trim();
	}

	return null;
};

export const decodeSocketToken = (token: string, secret: string = APP_SECRET_KEY): { id_user: number } => {
	const decoded = jwt.verify(token, secret) as { id_user?: number | string };
	const id = Number(decoded?.id_user);
	if (!decoded || !id || Number.isNaN(id)) throw new Error('Token tidak memuat id_user.');
	return { id_user: id };
};

export const loadUserForSocket = async (idUser: number): Promise<ISocketUser | null> => {
	const [user] = await postgresConnection.raw<
		Array<{
			id_user: number | string;
			nama: string;
			username: string;
			level: string;
			is_active: boolean | number;
		}>
	>(
		'SELECT id_user, nama, username, level, is_active FROM users WHERE id_user = ? LIMIT 1',
		[idUser]
	);
	if (!user || (user.is_active !== undefined && (user.is_active === false || Number(user.is_active) === 0))) {
		return null;
	}
	return {
		id_user: Number(user.id_user),
		username: user.username,
		nama: user.nama,
		level: user.level
	};
};
