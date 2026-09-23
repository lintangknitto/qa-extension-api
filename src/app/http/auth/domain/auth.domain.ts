import jwt from 'jsonwebtoken';
import { APP_SECRET_KEY } from '@/libs/config';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const generateToken = (user: Entity.IUser): string => jwt.sign(
	{ id_user: user.id_user, nama: user.nama, username: user.username },
	APP_SECRET_KEY,
	{ expiresIn: '7d' }
);

export const transformUserResponse = (user: Entity.IUser) => ({
	id_user: user.id_user,
	nama: user.nama,
	username: user.username,
	level: user.level,
	input: user.level === 'IMPLEMENTOR' ? 'enable' : 'disable'
});

export const validateUser = (user: Entity.IUser | null): void => {
	if (!user) {
		throw new InvalidParameterException('Username atau password salah');
	}
};
