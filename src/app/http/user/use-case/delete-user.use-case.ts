import * as queries from '../queries/user.queries';
import * as repo from '../repo/user.repo';
import * as domain from '../domain/user.domain';
import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export const deleteUserUseCase = async (ctx: {
	actorLevel?: string;
	actorUserId?: number;
	idUser: number;
}) => {
	if (ctx.actorUserId && ctx.actorUserId === ctx.idUser) {
		throw new InvalidParameterException('Tidak dapat menghapus akun Anda sendiri.');
	}

	const user = await queries.findUserById(ctx.idUser);
	domain.assertUserExists(user);

	domain.assertCanManageTargetUser(ctx.actorLevel, user.level);

	const associatedCount = await queries.countUserAssociatedData(ctx.idUser);
	if (associatedCount > 0) {
		await repo.softDeactivateUser(ctx.idUser);
		return {
			success: true,
			mode: 'deactivated',
			message: 'User memiliki riwayat data pengujian, status akun dialihkan ke nonaktif demi integritas data.'
		};
	}

	await repo.deleteUser(ctx.idUser);
	return {
		success: true,
		mode: 'deleted',
		message: 'User berhasil dihapus permanen.'
	};
};
