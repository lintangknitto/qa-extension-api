import * as queries from '../queries/auth.queries';
import * as domain from '../domain/auth.domain';
import { verifyPassword, hashPassword } from '@/libs/helpers/password';
import { InvalidParameterException, NotAuthorizationException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const changePasswordUseCase = async (ctx: {
	userId: number | undefined;
	oldPassword: string;
	newPassword: string;
}) => {
	if (!ctx.userId) {
		throw new NotAuthorizationException('Sesi otentikasi tidak valid.');
	}

	if (!ctx.newPassword || ctx.newPassword.length < 6) {
		throw new InvalidParameterException('Password baru minimal 6 karakter.');
	}

	const user = await queries.getUserById(ctx.userId);
	domain.validateUser(user);

	const validUser = user;
	const { valid } = await verifyPassword(ctx.oldPassword, validUser.password);
	domain.validateOldPasswordMatch(valid);

	const hashedNewPassword = await hashPassword(ctx.newPassword);
	await queries.updateUserPassword(ctx.userId, hashedNewPassword);

	return {
		success: true,
		message: 'Password berhasil diperbarui.'
	};
};
