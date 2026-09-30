import * as queries from '../queries/user.queries';
import * as repo from '../repo/user.repo';
import * as domain from '../domain/user.domain';
import { hashPassword } from '@/libs/helpers/password';

export const resetPasswordUseCase = async (ctx: {
	actorLevel?: string;
	idUser: number;
	password: string;
}) => {
	const user = await queries.findUserById(ctx.idUser);
	domain.assertUserExists(user);

	domain.assertCanManageTargetUser(ctx.actorLevel, user.level);

	const hashedPassword = await hashPassword(ctx.password);
	await repo.updateUserPassword(ctx.idUser, hashedPassword);

	return {
		success: true,
		message: 'Password user berhasil direset.'
	};
};
