import jwt from 'jsonwebtoken';
import { APP_SECRET_KEY } from '@/libs/config';
import { InvalidParameterException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const generateToken = (user: Entity.IUser, secret: string = APP_SECRET_KEY): string => jwt.sign(
	{ id_user: user.id_user, nama: user.nama, username: user.username, level: user.level },
	secret,
	{ expiresIn: '7d' }
);

export const transformUserResponse = (user: Entity.IUser) => {
	const isActive = user.is_active !== undefined ? Number(user.is_active) : (user.aktif !== undefined ? Number(user.aktif) : 1);
	return {
		id_user: user.id_user,
		nama: user.nama,
		username: user.username,
		level: user.level,
		is_active: isActive === 1,
		input: user.level === 'IMPLEMENTOR' ? 'enable' : 'disable'
	};
};

export const validateUser = (user: Entity.IUser | null): void => {
	if (!user) {
		throw new InvalidParameterException('Username atau password salah');
	}
	const isActive = user.is_active !== undefined ? Number(user.is_active) : (user.aktif !== undefined ? Number(user.aktif) : 1);
	if (isActive === 0) {
		throw new NotAuthorizationException('Akun pengguna telah dinonaktifkan. Silakan hubungi Administrator.');
	}
};

export const validatePasswordMatch = (isValid: boolean): void => {
	if (!isValid) {
		throw new InvalidParameterException('Username atau password salah');
	}
};

export const validateOldPasswordMatch = (isValid: boolean): void => {
	if (!isValid) {
		throw new InvalidParameterException('Password lama yang dimasukkan salah');
	}
};
