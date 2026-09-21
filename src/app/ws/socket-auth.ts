import jwt from 'jsonwebtoken';
import { APP_SECRET_KEY } from '@/libs/config';
import mysqlConnection from '@/libs/config/mysqlConnection';

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
	const decoded = jwt.verify(token, secret) as { id_user?: number };
	if (!decoded || typeof decoded.id_user !== 'number') throw new Error('Token tidak memuat id_user.');
	return { id_user: decoded.id_user };
};

export const loadUserForSocket = async (idUser: number): Promise<ISocketUser | null> => {
	const [user] = await mysqlConnection.raw<ISocketUser[]>(
		'SELECT id_user, nama, username, level FROM user WHERE id_user = ? LIMIT 1',
		[idUser]
	);
	return user ?? null;
};
