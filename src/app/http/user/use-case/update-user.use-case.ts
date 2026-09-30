import * as queries from '../queries/user.queries';
import * as repo from '../repo/user.repo';
import * as domain from '../domain/user.domain';
import { TUpdateUserValidation } from '../user.request';

export const updateUserUseCase = async (ctx: {
	actorLevel?: string;
	actorUserId?: number;
	idUser: number;
	body: TUpdateUserValidation;
}) => {
	const user = await queries.findUserById(ctx.idUser);
	domain.assertUserExists(user);

	const requestedLevel = ctx.body.level ? domain.normalizeUserLevel(ctx.body.level) : undefined;
	domain.assertCanManageTargetUser(ctx.actorLevel, user.level, requestedLevel);

	await repo.updateUser(ctx.idUser, {
		nama: ctx.body.nama !== undefined ? ctx.body.nama.trim() : undefined,
		level: requestedLevel,
		is_active: ctx.body.is_active !== undefined ? (ctx.body.is_active ? 1 : 0) : undefined
	});

	if (ctx.body.project_ids !== undefined) {
		await repo.setUserAssignedProjects(ctx.idUser, ctx.body.project_ids, ctx.actorUserId);
	}

	const updatedUser = await queries.findUserById(ctx.idUser);
	domain.assertUserExists(updatedUser);

	const assignedProjectIds = await queries.getUserAssignedProjectIds(ctx.idUser);
	return domain.toUserDetailResponse(updatedUser, assignedProjectIds);
};
